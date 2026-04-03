# Retrieval-Augmented Generation (RAG)

## Overview

Retrieval-Augmented Generation (RAG) is a powerful approach that combines the strengths of information retrieval with large language model generation. Instead of relying solely on a model's parametric knowledge, RAG retrieves relevant documents from a knowledge base and uses them to ground the model's responses.

## Architecture

### Core Components

The RAG pipeline consists of several key stages:

1. **Document Ingestion**: Raw documents are collected, parsed, and preprocessed.
2. **Chunking**: Documents are split into manageable chunks that preserve semantic meaning.
3. **Embedding**: Each chunk is converted into a dense vector representation.
4. **Indexing**: Vectors are stored in a vector database for efficient retrieval.
5. **Retrieval**: Given a query, the most relevant chunks are retrieved using similarity search.
6. **Generation**: An LLM generates a response grounded in the retrieved context.

### Benefits of RAG

- **Reduced Hallucination**: By grounding answers in actual documents, RAG significantly reduces hallucinated responses.
- **Up-to-date Information**: The knowledge base can be updated without retraining the model.
- **Transparency**: Sources can be cited, making responses traceable and verifiable.
- **Cost Efficiency**: Smaller models can achieve strong results when augmented with retrieval.

## Chunking Strategies

### Naive Chunking

The simplest approach splits text into fixed-size chunks (e.g., 500 characters). This is fast but often breaks sentences and removes context.

### Semantic Chunking

More sophisticated approaches consider the semantic structure of the document:

- **Heading-based splitting**: Documents are first split at heading boundaries, preserving the natural section structure.
- **Sentence-aware splitting**: Within sections, splits occur at sentence boundaries rather than arbitrary positions.
- **Overlap**: Chunks include overlapping text from adjacent chunks to preserve continuity.

### Token-Aware Chunking

Using tokenizers like `tiktoken`, chunks are sized based on token count rather than character count. This ensures consistent embedding quality and prevents context window overflow.

## Vector Databases

### FAISS (Facebook AI Similarity Search)

FAISS is an open-source library for efficient similarity search:

- **IndexFlatIP**: Exact inner product search, best for small-medium datasets.
- **IndexIVFFlat**: Approximate search with inverted file indexes, scales to millions of vectors.
- **IndexHNSW**: Hierarchical navigable small world graphs, excellent recall-speed tradeoff.

### Other Options

- **Qdrant**: Purpose-built vector database with filtering and payload support.
- **Pinecone**: Managed vector database service with automatic scaling.
- **Elasticsearch**: Traditional search engine with vector search capabilities.

## Hybrid Retrieval

Combining multiple retrieval strategies improves recall:

### Dense Retrieval (Semantic)

Uses embedding models to capture semantic meaning. Effective for paraphrased queries and conceptual matching.

### Sparse Retrieval (Keyword)

BM25 and TF-IDF capture exact term matches. Essential for proper nouns, technical terms, and exact phrases.

### Reciprocal Rank Fusion (RRF)

Merges results from multiple retrievers using rank-based scoring:

```
score(d) = Σ 1 / (k + rank(d, retriever))
```

This approach is score-agnostic, avoiding the need to normalize different scoring scales.

## Re-Ranking

Cross-encoder models analyze query-document pairs jointly, providing more accurate relevance scores than bi-encoder similarity. This is computationally expensive but dramatically improves precision when applied to a small candidate set.

### Popular Models

- `cross-encoder/ms-marco-MiniLM-L-6-v2`: Fast, good accuracy.
- `BAAI/bge-reranker-v2-m3`: State-of-the-art multilingual reranker.

## Evaluation Metrics

### Retrieval Quality

- **Recall@k**: Fraction of relevant documents in the top-k results.
- **MRR (Mean Reciprocal Rank)**: Average of the reciprocal of the rank of the first relevant result.
- **NDCG**: Normalized Discounted Cumulative Gain, considers the position of relevant results.

### Generation Quality

- **Faithfulness**: Does the answer only contain information from the provided context?
- **Relevance**: Does the answer address the user's question?
- **Completeness**: Does the answer cover all relevant information from the context?

## Best Practices

1. **Chunk size matters**: 300-700 tokens is generally optimal for most embedding models.
2. **Include metadata**: Store file names, section titles, and paths with each chunk for traceability.
3. **Deduplicate**: Hash chunk content to avoid redundant embeddings.
4. **Limit context**: Use only the top 3-5 most relevant chunks to avoid noise.
5. **Clear instructions**: System prompts should explicitly instruct the model to only use provided context.
