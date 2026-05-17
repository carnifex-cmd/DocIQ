# Business Document RAG Assistant

Simple one-pass RAG app for quotations, invoices, and business letters.

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
    providers/
      __init__.py
      embeddings.py
      llm.py
    uploads/
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
```

### Mode 2: Groq + Hugging Face

```env
GROQ_API_KEY=your_key
LLM_PROVIDER=groq
EMBEDDING_PROVIDER=huggingface
GROQ_CHAT_MODEL=llama-3.1-8b-instant
HF_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
```

Hugging Face embeddings run locally. The first run may download the embedding model.

If you switch between provider modes, delete `backend/chroma_db` and re-upload documents:

```text
Embedding provider changed. Delete backend/chroma_db and re-upload documents.
```

## API

### `POST /upload`

- Accepts multiple `PDF` or `DOCX` files as `multipart/form-data`
- Saves them in `backend/uploads/`
- Extracts text and keeps PDF page numbers where available
- Chunks text with `800` characters and `150` overlap
- Computes embeddings with the selected embedding provider
- Stores `ids`, `documents`, `embeddings`, and `metadata` in ChromaDB

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

If the answer is not supported by the uploaded files, the backend returns:

```text
I could not find this in the uploaded documents.
```
