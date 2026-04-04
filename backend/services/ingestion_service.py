"""Ingestion service — orchestrates document processing pipeline.

Handles file upload, ZIP extraction, directory traversal,
parsing, chunking, embedding, and indexing.
"""

import asyncio
import logging
import shutil
import zipfile
from pathlib import Path
from typing import Optional

from config import get_settings
from models.document import DocumentChunk, IngestedFile, ParsedDocument
from services.document_parser import DocumentParser
from services.chunking_service import ChunkingService
from services.embedding_service import EmbeddingService
from services.vector_store import VectorStore
from services.bm25_store import BM25Store

logger = logging.getLogger(__name__)

settings = get_settings()


class IngestionService:
    """Orchestrates the full document ingestion pipeline."""

    def __init__(
        self,
        parser: DocumentParser,
        chunker: ChunkingService,
        embedding_service: EmbeddingService,
        vector_store: VectorStore,
        bm25_store: BM25Store,
    ):
        self.parser = parser
        self.chunker = chunker
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.bm25_store = bm25_store

        # Track ingested files
        self._files: dict[str, IngestedFile] = {}
        self._processing = False
        self._lock = asyncio.Lock()

        # Rebuild tracking state from existing vector store metadata
        self._sync_from_store()

    def _sync_from_store(self):
        """Rebuild _files tracking map from the vector store metadata.

        Two-pass approach:
        1. Chunks that already carry a file_id (newly indexed data) are grouped
           by that ID.
        2. Chunks without a file_id (legacy data) are grouped by file_path and
           assigned a deterministic ID derived from the path hash. The file_id
           is also backfilled into the chunk metadata so that future operations
           (scoped search, deletion) work correctly.
        """
        try:
            chunks = self.vector_store.chunks
            if not chunks:
                return

            # Track which file_paths already have a file_id assigned
            path_to_file_id: dict[str, str] = {}
            needs_save = False

            # Pass 1: Process chunks that already have file_id
            for chunk in chunks:
                file_path = chunk.get("file_path")
                if not file_path:
                    continue

                file_id = chunk.get("file_id")
                if not file_id:
                    continue

                path_to_file_id[file_path] = file_id

                if file_id not in self._files:
                    path = Path(file_path)
                    try:
                        size = path.stat().st_size if path.exists() else 0
                    except Exception:
                        size = 0
                    self._files[file_id] = IngestedFile(
                        file_id=file_id,
                        file_name=chunk.get("file_name", path.name),
                        file_path=file_path,
                        file_size=size,
                        document_type=chunk.get("document_type", ""),
                        status="indexed",
                        chunk_count=0,
                    )

                self._files[file_id].chunk_count += 1

            # Pass 2: Backfill chunks that are missing file_id (legacy data)
            for chunk in chunks:
                file_path = chunk.get("file_path")
                if not file_path or chunk.get("file_id"):
                    continue

                # Reuse an existing ID for this path if we already assigned one,
                # otherwise generate a deterministic one from the path
                if file_path in path_to_file_id:
                    file_id = path_to_file_id[file_path]
                else:
                    import hashlib
                    file_id = hashlib.sha256(file_path.encode()).hexdigest()[:16]
                    path_to_file_id[file_path] = file_id

                # Backfill the metadata so scoped search works
                chunk["file_id"] = file_id
                needs_save = True

                if file_id not in self._files:
                    path = Path(file_path)
                    try:
                        size = path.stat().st_size if path.exists() else 0
                    except Exception:
                        size = 0
                    self._files[file_id] = IngestedFile(
                        file_id=file_id,
                        file_name=chunk.get("file_name", path.name),
                        file_path=file_path,
                        file_size=size,
                        document_type=chunk.get("document_type", ""),
                        status="indexed",
                        chunk_count=0,
                    )

                self._files[file_id].chunk_count += 1

            # Persist backfilled file_ids so they survive restarts
            if needs_save:
                self.vector_store._save()
                # Also backfill BM25 metadata
                for meta in self.bm25_store.metadata:
                    fp = meta.get("file_path")
                    if fp and not meta.get("file_id") and fp in path_to_file_id:
                        meta["file_id"] = path_to_file_id[fp]
                self.bm25_store._save()
                logger.info("Backfilled file_id into legacy chunk metadata.")

            logger.info(f"Synchronized IngestionService with {len(self._files)} files from store.")
        except Exception as e:
            logger.error(f"Failed to sync IngestionService from store: {e}")

    @property
    def is_processing(self) -> bool:
        return self._processing

    def register_files(self, file_paths: list[str]) -> list[IngestedFile]:
        """Register files in the tracking list with 'pending' status.

        This should be called before the background ingestion starts
        to ensure the status is immediately reflected in the API.

        Args:
            file_paths: List of file paths to ingest.

        Returns:
            List of IngestedFile tracking objects.
        """
        results: list[IngestedFile] = []

        for file_path in file_paths:
            path = Path(file_path)
            if not path.exists():
                logger.warning(f"File not found: {file_path}")
                continue

            ext = path.suffix.lower()
            if ext not in settings.SUPPORTED_EXTENSIONS:
                logger.info(f"Skipping unsupported file: {path.name}")
                continue

            ingested = IngestedFile(
                file_name=path.name,
                file_path=str(path),
                file_size=path.stat().st_size,
                document_type=ext.lstrip("."),
                status="pending",
            )
            self._files[ingested.file_id] = ingested
            results.append(ingested)

        return results

    async def process_ingested_files(self, files: list[IngestedFile]):
        """Process pre-registered files through the pipeline.

        Args:
            files: List of IngestedFile objects to process.
        """
        if not files:
            return

        async with self._lock:
            self._processing = True
            try:
                await self._process_files(files)
            finally:
                self._processing = False

    async def ingest_files(self, file_paths: list[str]) -> list[IngestedFile]:
        """Ingest multiple files through the full pipeline (sync registration).

        Args:
            file_paths: List of file paths to ingest.

        Returns:
            List of IngestedFile tracking objects.
        """
        results = self.register_files(file_paths)

        if results:
            await self.process_ingested_files(results)

        return results

    async def ingest_zip(self, zip_path: str, parent_folder_id: Optional[str] = None) -> list[IngestedFile]:
        """Extract and ingest a ZIP file, maintaining folder hierarchy.

        The ZIP is extracted into a subdirectory named after the ZIP file stem.
        E.g. uploading 'docs.zip' into 'Folder1' creates:
          Folder1/docs/file1.txt
          Folder1/docs/sub/file2.txt

        Args:
            zip_path: Path to the ZIP file.
            parent_folder_id: Optional ID of the virtual folder the ZIP was uploaded into.

        Returns:
            List of IngestedFile tracking objects.
        """
        path = Path(zip_path)
        if not zipfile.is_zipfile(str(path)):
            raise ValueError(f"Not a valid ZIP file: {zip_path}")

        # Create a subdirectory named after the ZIP (preserves ZIP name in hierarchy)
        extract_dir = path.parent / path.stem
        extract_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Extracting ZIP: {path.name} → {extract_dir}")

        with zipfile.ZipFile(str(path), "r") as zf:
            namelist = zf.namelist()
            zf.extractall(str(extract_dir))

        # Clean up the ZIP file itself
        try:
            path.unlink()
        except Exception:
            pass

        # 1. Create wrapper virtual folder for the ZIP name + sync internal structure
        try:
            from api.routes_folders import sync_zip_metadata, update_file_assignments
            path_to_id = sync_zip_metadata(namelist, extract_dir, parent_folder_id)
        except Exception as e:
            logger.error(f"Failed to sync folder metadata for ZIP: {e}")
            path_to_id = {}

        # 2. Find and register only the files from this ZIP
        file_paths = []
        for name in namelist:
            extracted_path = (extract_dir / name).absolute()
            if extracted_path.is_file() and extracted_path.suffix.lower() in settings.SUPPORTED_EXTENSIONS:
                file_paths.append(str(extracted_path))

        logger.info(f"Found {len(file_paths)} supported files in ZIP hierarchy")

        ingested_files = self.register_files(file_paths)

        # 3. Update file assignments in metadata
        if ingested_files and path_to_id:
            new_assignments = {}
            for f in ingested_files:
                file_abs_path = Path(f.file_path).absolute()
                parent_path_str = file_abs_path.parent.as_posix()

                folder_id = path_to_id.get(parent_path_str)
                if folder_id:
                    new_assignments[f.file_id] = folder_id
                else:
                    logger.warning(f"No folder ID mapping for {parent_path_str}")

            if new_assignments:
                try:
                    update_file_assignments(new_assignments)
                    logger.info(f"Successfully assigned {len(new_assignments)} files to folders.")
                except Exception as e:
                    logger.error(f"Failed to update file assignments for ZIP: {e}")

        # 4. Ingest files (parse, chunk, embed)
        if ingested_files:
            await self.process_ingested_files(ingested_files)

        return ingested_files

    async def ingest_directory(self, dir_path: str) -> list[IngestedFile]:
        """Recursively ingest all supported files in a directory.

        Args:
            dir_path: Path to the directory.

        Returns:
            List of IngestedFile tracking objects.
        """
        path = Path(dir_path)
        if not path.is_dir():
            raise ValueError(f"Not a directory: {dir_path}")

        file_paths = self._find_supported_files(path)
        logger.info(f"Found {len(file_paths)} supported files in directory")

        return await self.ingest_files(file_paths)

    async def delete_file(self, file_id: str) -> bool:
        """Delete a file and its chunks from all indices.

        Args:
            file_id: File ID to delete.

        Returns:
            True if deleted, False if not found.
        """
        ingested = self._files.get(file_id)
        if not ingested:
            return False

        file_path = ingested.file_path

        # Remove from vector store
        self.vector_store.delete_by_file(file_path)

        # Remove from BM25
        self.bm25_store.delete_by_file(file_path)

        # Remove physical file from disk
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                logger.info(f"Deleted file from disk: {file_path}")
                # Clean up empty parent directories up to uploads root
                parent = path.parent
                upload_root = settings.UPLOAD_DIR
                while parent != upload_root and parent.is_dir():
                    try:
                        parent.rmdir()  # Only removes if empty
                        parent = parent.parent
                    except OSError:
                        break
        except Exception as e:
            logger.error(f"Error deleting file from disk: {e}")

        # Remove tracking
        del self._files[file_id]

        logger.info(f"Deleted file: {ingested.file_name} (id={file_id})")
        return True

    def rename_file(self, file_id: str, new_name: str) -> bool:
        """Rename an ingested file.

        Args:
            file_id: File ID to rename.
            new_name: New file name.

        Returns:
            True if renamed, False if not found.
        """
        ingested = self._files.get(file_id)
        if not ingested:
            return False

        old_path = Path(ingested.file_path)
        new_path = old_path.parent / new_name

        # Rename on disk
        try:
            if old_path.exists():
                old_path.rename(new_path)
        except Exception as e:
            logger.error(f"Error renaming file on disk: {e}")
            return False

        # Update index paths
        self.vector_store.update_file_paths(str(old_path), str(new_path))
        self.bm25_store.update_file_paths(str(old_path), str(new_path))

        # Update tracking
        ingested.file_name = new_name
        ingested.file_path = str(new_path)
        logger.info(f"Renamed file {file_id}: {old_path.name} → {new_name}")
        return True

    def move_file(self, file_id: str, new_disk_path: str) -> bool:
        """Move a file to a new location on disk and update indices.

        Args:
            file_id: File ID to move.
            new_disk_path: Full destination path on disk.

        Returns:
            True if moved, False if not found.
        """
        ingested = self._files.get(file_id)
        if not ingested:
            return False

        old_path = ingested.file_path
        new_path_obj = Path(new_disk_path)

        # Create destination directory
        new_path_obj.parent.mkdir(parents=True, exist_ok=True)

        # Move file on disk
        try:
            shutil.move(old_path, str(new_path_obj))
        except Exception as e:
            logger.error(f"Error moving file on disk: {e}")
            return False

        # Update index paths
        self.vector_store.update_file_paths(old_path, str(new_path_obj))
        self.bm25_store.update_file_paths(old_path, str(new_path_obj))

        # Update tracking
        ingested.file_path = str(new_path_obj)
        logger.info(f"Moved file {file_id}: {old_path} → {new_path_obj}")

        # Clean up empty source directories
        try:
            old_parent = Path(old_path).parent
            upload_root = settings.UPLOAD_DIR
            while old_parent != upload_root and old_parent.is_dir():
                try:
                    old_parent.rmdir()
                    old_parent = old_parent.parent
                except OSError:
                    break
        except Exception:
            pass

        return True

    def get_file_by_id(self, file_id: str) -> Optional[IngestedFile]:
        """Get IngestedFile by ID.

        Args:
            file_id: File ID.

        Returns:
            IngestedFile or None.
        """
        return self._files.get(file_id)

    def get_status(self) -> dict:
        """Get current ingestion status.

        Returns:
            Status dict with file counts and details.
        """
        files = list(self._files.values())
        return {
            "total_files": len(files),
            "indexed": sum(1 for f in files if f.status == "indexed"),
            "processing": sum(
                1 for f in files if f.status in ("pending", "parsing", "chunking", "embedding")
            ),
            "errored": sum(1 for f in files if f.status == "error"),
            "files": [f.to_dict() for f in files],
        }

    def get_files(self) -> list[dict]:
        """Get all ingested files.

        Returns:
            List of file info dicts.
        """
        return [f.to_dict() for f in self._files.values()]

    def get_files_by_ids(self, file_ids: list[str]) -> list[dict]:
        """Get ingested files by their IDs.

        Args:
            file_ids: List of file IDs.

        Returns:
            List of file info dicts for matching IDs.
        """
        return [
            f.to_dict()
            for fid, f in self._files.items()
            if fid in file_ids
        ]

    def get_file_paths_for_ids(self, file_ids: list[str]) -> list[str]:
        """Resolve file IDs to their file paths.

        Args:
            file_ids: List of file IDs.

        Returns:
            List of file path strings.
        """
        paths = []
        for fid in file_ids:
            f = self._files.get(fid)
            if f:
                paths.append(f.file_path)
        return paths

    async def _process_files(self, files: list[IngestedFile]):
        """Process files through the ingestion pipeline.

        Pipeline for each file:
        1. Parse → extract sections
        2. Chunk → split into token-sized pieces
        3. Embed → generate embeddings
        4. Index → store in FAISS + BM25

        Args:
            files: List of IngestedFile objects to process.
        """
        all_chunks: list[DocumentChunk] = []

        for ingested in files:
            try:
                # Step 1: Parse
                ingested.status = "parsing"
                logger.info(f"Parsing: {ingested.file_name}")

                parsed = self.parser.parse(ingested.file_path)

                # Step 2: Chunk
                ingested.status = "chunking"
                chunks = self.chunker.chunk_document(parsed)
                ingested.chunk_count = len(chunks)

                # Set file_id on all chunks
                for chunk in chunks:
                    chunk.file_id = ingested.file_id

                all_chunks.extend(chunks)
                logger.info(
                    f"Chunked {ingested.file_name}: {len(chunks)} chunks"
                )

            except Exception as e:
                ingested.status = "error"
                ingested.error_message = str(e)
                logger.error(f"Error processing {ingested.file_name}: {e}")

        if not all_chunks:
            return

        # Step 3: Embed all chunks in batch
        for ingested in files:
            if ingested.status not in ("error",):
                ingested.status = "embedding"

        try:
            new_chunks, embeddings = self.embedding_service.embed_chunks(all_chunks)

            if len(new_chunks) > 0:
                # Step 4: Add to vector store
                self.vector_store.add_embeddings(embeddings, new_chunks)

                # Step 5: Add to BM25 store
                texts = [c.text for c in new_chunks]
                metadata = [c.to_dict() for c in new_chunks]
                self.bm25_store.add_documents(texts, metadata)

            # Mark all as indexed
            for ingested in files:
                if ingested.status != "error":
                    ingested.status = "indexed"

            logger.info(
                f"Ingestion complete: {len(new_chunks)} chunks indexed"
            )

        except Exception as e:
            logger.error(f"Embedding/indexing error: {e}")
            for ingested in files:
                if ingested.status != "error":
                    ingested.status = "error"
                    ingested.error_message = f"Embedding error: {str(e)}"

    def _find_supported_files(self, directory: Path) -> list[str]:
        """Recursively find all supported files in a directory.

        Args:
            directory: Root directory to search.

        Returns:
            List of file path strings.
        """
        files = []
        for ext in settings.SUPPORTED_EXTENSIONS:
            files.extend(str(f) for f in directory.rglob(f"*{ext}"))
        return sorted(files)
