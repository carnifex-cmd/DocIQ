# Business Document RAG Assistant

Minimal RAG app for quotations, invoices, and business letters using backend folder-based ingestion.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: FastAPI, ChromaDB, OpenAI, Groq, Sentence Transformers, PyMuPDF, python-docx

## Project Structure

```text
ragQuotation/
  frontend/
    app/
      globals.css
      layout.tsx
      page.tsx
    .env.local.example
    next.config.mjs
    next-env.d.ts
    package.json
    postcss.config.js
    tailwind.config.ts
    tsconfig.json
  backend/
    chroma_db/
    documents/
    providers/
      __init__.py
      embeddings.py
      llm.py
    .env.example
    config.py
    main.py
    requirements.txt
  README.md
```

## Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

## Frontend Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

By default the frontend expects the API at `http://127.0.0.1:8000`.

## Provider Modes

### Mode 1: OpenAI

```env
OPENAI_API_KEY=your_key
LLM_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DOCUMENTS_DIR=documents
```

### Mode 2: Groq + Hugging Face

```env
GROQ_API_KEY=your_key
LLM_PROVIDER=groq
EMBEDDING_PROVIDER=huggingface
GROQ_CHAT_MODEL=llama-3.1-8b-instant
HF_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
DOCUMENTS_DIR=documents
```

`DOCUMENTS_DIR` is resolved relative to `backend/`, so the default value points to `backend/documents/`.

Hugging Face embeddings run locally. The first run may download the embedding model.

If you switch between provider modes, delete `backend/chroma_db` and re-index the documents:

```text
Embedding provider changed. Delete backend/chroma_db and re-index the documents.
```

## Usage

1. Put PDF or DOCX files into `backend/documents/`.
2. Run the backend and frontend.
3. Click `Index Documents`.
4. Ask questions in the frontend.
5. To add or update documents, place them in `backend/documents/` and click `Index Documents` again.

The backend scans `backend/documents/` recursively, skips unsupported files, avoids re-indexing unchanged files, and refreshes changed files automatically.

## API

### `POST /index`

- Scans `backend/documents/` recursively
- Processes supported `.pdf` and `.docx` files
- Skips unchanged or unsupported files
- Re-indexes files whose content or modified timestamp changed
- Removes indexed chunks for files that were deleted from the folder

Response body:

```json
{
  "total_files_found": 4,
  "files_indexed": 2,
  "files_skipped": 2,
  "chunks_created": 18,
  "errors": []
}
```

### `GET /index/status`

Response body:

```json
{
  "indexed_files_count": 2,
  "total_chunks": 18,
  "embedding_provider": "openai",
  "llm_provider": "openai"
}
```

### `POST /ask`

Request body:

```json
{
  "question": "What is the quoted amount?"
}
```

Response body:

```json
{
  "answer": "The quoted amount is $12,500.",
  "sources": [
    {
      "source_file": "quotation.pdf",
      "page_number": 2
    }
  ]
}
```

If the answer is not supported by the indexed files, the backend returns:

```text
I could not find this in the indexed documents.
```
