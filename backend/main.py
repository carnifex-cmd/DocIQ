from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any

import chromadb
import fitz
from chromadb.config import Settings
from docx import Document
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import EMBEDDING_PROVIDER_CHANGED_MESSAGE, FALLBACK_ANSWER, settings
from providers.embeddings import embed_query, embed_texts
from providers.llm import generate_answer


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
CHROMA_DIR = BASE_DIR / "chroma_db"
STORE_METADATA_PATH = CHROMA_DIR / "embedding_metadata.json"
SUPPORTED_EXTENSIONS = {".pdf", ".docx"}
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Business Document RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chroma_client = chromadb.PersistentClient(
    path=str(CHROMA_DIR),
    settings=Settings(
        anonymized_telemetry=False,
        chroma_product_telemetry_impl="chroma_telemetry.NoOpTelemetry",
    ),
)
collection = chroma_client.get_or_create_collection(name="business_documents")


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]]


class UploadResponse(BaseModel):
    processed_files: list[str]
    chunk_count: int


def normalize_text(text: str) -> str:
    cleaned_lines = []
    for line in text.splitlines():
        compact_line = re.sub(r"\s+", " ", line).strip()
        if compact_line:
            cleaned_lines.append(compact_line)
    return "\n".join(cleaned_lines)


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_length:
            break
        start = max(end - overlap, 0)

    return chunks


def extract_pdf_documents(file_path: Path, source_file: str) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    pdf = fitz.open(file_path)

    try:
        for page_index, page in enumerate(pdf, start=1):
            text = normalize_text(page.get_text("text"))
            for chunk in chunk_text(text):
                documents.append(
                    {
                        "text": chunk,
                        "metadata": {
                            "source_file": source_file,
                            "file_type": "pdf",
                            "page_number": page_index,
                        },
                    }
                )
    finally:
        pdf.close()

    return documents


def extract_docx_text(file_path: Path) -> str:
    document = Document(str(file_path))
    sections: list[str] = []

    for paragraph in document.paragraphs:
        paragraph_text = paragraph.text.strip()
        if paragraph_text:
            sections.append(paragraph_text)

    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                sections.append(" | ".join(cells))

    return normalize_text("\n".join(sections))


def extract_docx_documents(file_path: Path, source_file: str) -> list[dict[str, Any]]:
    text = extract_docx_text(file_path)
    documents: list[dict[str, Any]] = []

    for chunk in chunk_text(text):
        documents.append(
            {
                "text": chunk,
                "metadata": {
                    "source_file": source_file,
                    "file_type": "docx",
                    "page_number": -1,
                },
            }
        )

    return documents


def extract_documents(file_path: Path, source_file: str) -> list[dict[str, Any]]:
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        return extract_pdf_documents(file_path, source_file)
    if suffix == ".docx":
        return extract_docx_documents(file_path, source_file)

    raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")


def build_storage_name(filename: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename).strip("._")
    safe_name = safe_name or "document"
    return f"{uuid.uuid4().hex}_{safe_name}"


async def save_upload_file(upload: UploadFile) -> Path:
    destination = UPLOAD_DIR / build_storage_name(upload.filename or "document")
    content = await upload.read()
    destination.write_bytes(content)
    await upload.close()
    return destination


def delete_existing_chunks(source_file: str) -> None:
    try:
        collection.delete(where={"source_file": source_file})
    except Exception:
        pass


def current_store_metadata(dimension: int) -> dict[str, Any]:
    return {
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.embedding_model,
        "embedding_dimension": dimension,
    }


def read_store_metadata() -> dict[str, Any] | None:
    if not STORE_METADATA_PATH.exists():
        return None

    try:
        return json.loads(STORE_METADATA_PATH.read_text())
    except json.JSONDecodeError:
        return None


def write_store_metadata(dimension: int) -> None:
    STORE_METADATA_PATH.write_text(json.dumps(current_store_metadata(dimension), indent=2))


def ensure_store_compatibility(dimension: int) -> None:
    if collection.count() == 0:
        return

    store_metadata = read_store_metadata()
    if not store_metadata:
        raise HTTPException(status_code=400, detail=EMBEDDING_PROVIDER_CHANGED_MESSAGE)

    expected_metadata = current_store_metadata(dimension)
    for key, value in expected_metadata.items():
        if store_metadata.get(key) != value:
            raise HTTPException(status_code=400, detail=EMBEDDING_PROVIDER_CHANGED_MESSAGE)


def is_dimension_mismatch_error(error: Exception) -> bool:
    message = str(error).lower()
    return "dimension" in message or "embedding" in message


def upsert_documents(documents: list[dict[str, Any]], files_to_refresh: list[str]) -> int:
    if not documents:
        return 0

    texts = [item["text"] for item in documents]
    metadatas = [item["metadata"] for item in documents]
    embeddings = embed_texts(texts)

    if not embeddings:
        return 0

    ensure_store_compatibility(len(embeddings[0]))
    for filename in files_to_refresh:
        delete_existing_chunks(filename)

    ids = [f"chunk-{uuid.uuid4().hex}" for _ in documents]

    try:
        collection.upsert(
            ids=ids,
            documents=texts,
            metadatas=metadatas,
            embeddings=embeddings,
        )
    except Exception as error:
        if is_dimension_mismatch_error(error):
            raise HTTPException(status_code=400, detail=EMBEDDING_PROVIDER_CHANGED_MESSAGE) from error
        raise

    write_store_metadata(len(embeddings[0]))
    return len(documents)


def format_context(documents: list[str], metadatas: list[dict[str, Any]]) -> str:
    blocks: list[str] = []

    for index, (document, metadata) in enumerate(zip(documents, metadatas), start=1):
        page_number = metadata.get("page_number")
        page_label = page_number if isinstance(page_number, int) and page_number > 0 else "N/A"
        blocks.append(
            "\n".join(
                [
                    f"Source {index}",
                    f"File: {metadata.get('source_file', 'Unknown')}",
                    f"Page: {page_label}",
                    "Content:",
                    document,
                ]
            )
        )

    return "\n\n".join(blocks)


def build_sources(metadatas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique_sources: list[dict[str, Any]] = []
    seen: set[tuple[str, Any]] = set()

    for metadata in metadatas:
        source_file = metadata.get("source_file", "Unknown")
        page_number = metadata.get("page_number")
        source_key = (source_file, page_number)
        if source_key in seen:
            continue
        seen.add(source_key)
        unique_sources.append(
            {
                "source_file": source_file,
                "page_number": page_number if isinstance(page_number, int) and page_number > 0 else None,
            }
        )

    return unique_sources


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse)
async def upload_documents(files: list[UploadFile] = File(...)) -> UploadResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Please upload at least one file.")

    extracted_documents: list[dict[str, Any]] = []
    processed_files: list[str] = []
    files_to_refresh: list[str] = []

    for upload in files:
        filename = upload.filename or ""
        suffix = Path(filename).suffix.lower()

        if suffix not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type for {filename}. Only PDF and DOCX files are supported.",
            )

        saved_file = await save_upload_file(upload)
        file_documents = extract_documents(saved_file, filename)

        if not file_documents:
            raise HTTPException(
                status_code=400,
                detail=f"No extractable text found in {filename}.",
            )

        extracted_documents.extend(file_documents)
        processed_files.append(filename)
        files_to_refresh.append(filename)

    chunk_count = upsert_documents(extracted_documents, files_to_refresh)
    return UploadResponse(processed_files=processed_files, chunk_count=chunk_count)


@app.post("/ask", response_model=AskResponse)
def ask_question(payload: AskRequest) -> AskResponse:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if collection.count() == 0:
        return AskResponse(answer=FALLBACK_ANSWER, sources=[])

    query_embedding = embed_query(question)
    ensure_store_compatibility(len(query_embedding))

    try:
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=5,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as error:
        if is_dimension_mismatch_error(error):
            raise HTTPException(status_code=400, detail=EMBEDDING_PROVIDER_CHANGED_MESSAGE) from error
        raise

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    if not documents or not metadatas:
        return AskResponse(answer=FALLBACK_ANSWER, sources=[])

    context = format_context(documents, metadatas)
    answer = generate_answer(question=question, context=context)
    return AskResponse(answer=answer, sources=build_sources(metadatas))
