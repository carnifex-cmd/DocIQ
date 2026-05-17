from __future__ import annotations

from openai import OpenAI
from sentence_transformers import SentenceTransformer

from config import settings


_openai_client: OpenAI | None = None
_sentence_transformer: SentenceTransformer | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def get_sentence_transformer() -> SentenceTransformer:
    global _sentence_transformer
    if _sentence_transformer is None:
        _sentence_transformer = SentenceTransformer(settings.hf_embedding_model)
    return _sentence_transformer


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    if settings.embedding_provider == "openai":
        embeddings: list[list[float]] = []
        client = get_openai_client()

        for start in range(0, len(texts), 50):
            batch = texts[start : start + 50]
            response = client.embeddings.create(model=settings.openai_embedding_model, input=batch)
            embeddings.extend(item.embedding for item in response.data)

        return embeddings

    model = get_sentence_transformer()
    embeddings = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return embeddings.tolist()


def embed_query(text: str) -> list[float]:
    if settings.embedding_provider == "openai":
        response = get_openai_client().embeddings.create(
            model=settings.openai_embedding_model,
            input=text,
        )
        return response.data[0].embedding

    model = get_sentence_transformer()
    embedding = model.encode([text], normalize_embeddings=True, convert_to_numpy=True)
    return embedding[0].tolist()
