# RAG Pipeline — Production-Grade Document Intelligence

A complete Retrieval-Augmented Generation system with document ingestion, hybrid search, cross-encoder reranking, and a premium ChatGPT-style UI.

## 🏗️ Architecture

```
┌─────────────┐    ┌──────────────────────────────────────────────────┐
│   Frontend   │    │                  Backend (FastAPI)                │
│  React/Vite  │    │                                                  │
│              │───▶│  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  • Chat UI   │    │  │Ingestion│  │ Document  │  │   Chunking    │  │
│  • Upload    │    │  │ Service │─▶│  Parser   │─▶│   Service     │  │
│  • Sources   │    │  └─────────┘  └──────────┘  └───────┬───────┘  │
│  • History   │    │                                      │          │
│              │    │                              ┌───────▼───────┐  │
│              │    │                              │   Embedding   │  │
│              │    │                              │   (OpenAI)    │  │
│              │    │                              └───────┬───────┘  │
│              │    │                                      │          │
│              │    │  ┌───────────┐  ┌──────────┐  ┌─────▼─────┐   │
│              │◀───│  │  Query    │  │Retrieval │  │  FAISS +   │   │
│              │    │  │  Engine   │◀─│  + RRF   │◀─│   BM25     │   │
│              │    │  │  (LLM)   │  │          │  │  Indices   │   │
│              │    │  └─────┬────┘  └──────────┘  └───────────┘   │
│              │    │        │                                       │
│              │    │  ┌─────▼─────┐                                │
│              │    │  │Cross-Enc. │                                │
│              │    │  │ Reranker  │                                │
│              │    │  └───────────┘                                │
└─────────────┘    └──────────────────────────────────────────────────┘
```

## ⚡ Quick Start

### Prerequisites

- **Python 3.11+** (3.13 works fine)
- **Node.js 16+**
- **OpenAI API Key** (for embeddings and chat)

### 1. Clone & Setup Backend

```bash
cd RAG/backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\Activate.ps1

# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

Set your OpenAI API key as an environment variable:

```bash
# Windows PowerShell
$env:OPENAI_API_KEY = "your-key-here"

# Linux/Mac
export OPENAI_API_KEY="your-key-here"
```

### 3. Start Backend

```bash
cd RAG/backend
.\venv\Scripts\Activate.ps1  # Windows
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The first startup will download the cross-encoder model (~80MB).

### 4. Setup & Start Frontend

```bash
cd RAG/frontend
npm install
npm run dev
```

### 5. Open the App

Navigate to **http://localhost:5173**

## 📦 Supported File Types

| Format | Extension | Parser |
|--------|-----------|--------|
| PDF | `.pdf` | PyMuPDF (font-size heading detection) |
| Word | `.docx` | python-docx (style introspection) |
| Markdown | `.md` | Native heading parsing |
| Plain Text | `.txt` | Implicit heading detection |
| ZIP | `.zip` | Auto-extraction + recursive scan |

## 🔌 API Documentation

Once the backend is running, visit **http://localhost:8000/docs** for the interactive Swagger UI.

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ingest/files` | Upload files for ingestion |
| `POST` | `/api/ingest/zip` | Upload ZIP file |
| `POST` | `/api/ingest/folder` | Upload folder files |
| `GET` | `/api/ingest/status` | Get processing status |
| `POST` | `/api/query` | Non-streaming query |
| `POST` | `/api/query/stream` | Streaming query (SSE) |
| `GET` | `/api/stats` | System statistics |
| `GET` | `/api/health` | Health check |

## 🧠 RAG Pipeline Details

### Chunking Strategy
- **Tier 1**: Split by headings/sections (from parser)
- **Tier 2**: Token-aware sub-chunking (300-700 tokens, 75 token overlap)
- Sentence boundary preservation
- Metadata attached: file_name, file_path, section_title, document_type

### Retrieval
- **Semantic**: FAISS IndexFlatIP with OpenAI `text-embedding-3-large` (3072 dims)
- **Keyword**: BM25Okapi sparse retrieval
- **Fusion**: Reciprocal Rank Fusion (k=60)

### Reranking
- `cross-encoder/ms-marco-MiniLM-L-6-v2` (runs locally)
- Top 5 chunks selected for LLM context

### Generation
- OpenAI `gpt-4o` with grounding prompt
- Max 6000 context tokens
- 5-turn conversation history
- Refuses to answer if context insufficient

## 📁 Project Structure

```
RAG/
├── backend/
│   ├── main.py             # FastAPI entry point
│   ├── config.py           # Settings
│   ├── requirements.txt
│   ├── api/                # REST endpoints
│   ├── models/             # Data models
│   ├── services/           # Business logic
│   │   ├── document_parser.py
│   │   ├── chunking_service.py
│   │   ├── embedding_service.py
│   │   ├── vector_store.py
│   │   ├── bm25_store.py
│   │   ├── retrieval_service.py
│   │   ├── reranker_service.py
│   │   ├── query_service.py
│   │   └── ingestion_service.py
│   └── tests/
│       └── sample_data/
├── frontend/
│   ├── src/
│   │   ├── components/     # React UI components
│   │   ├── services/       # API client
│   │   ├── App.jsx
│   │   └── index.css       # Design system
│   └── package.json
└── README.md
```

## 🔒 Notes

- All data is stored locally (FAISS index + BM25 in `backend/storage/`)
- No data is sent externally except to OpenAI for embeddings and completions
- Cross-encoder model runs 100% locally
- Conversation history is in-memory (resets on server restart)
