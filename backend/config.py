from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
FALLBACK_ANSWER = "I could not find this in the uploaded documents."
EMBEDDING_PROVIDER_CHANGED_MESSAGE = (
    "Embedding provider changed. Delete backend/chroma_db and re-upload documents."
)
SUPPORTED_LLM_PROVIDERS = {"openai", "groq"}
SUPPORTED_EMBEDDING_PROVIDERS = {"openai", "huggingface"}

load_dotenv(BASE_DIR / ".env")


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class AppConfig:
    openai_api_key: str
    groq_api_key: str
    llm_provider: str
    embedding_provider: str
    openai_chat_model: str
    openai_embedding_model: str
    groq_chat_model: str
    hf_embedding_model: str
    frontend_origins: list[str]

    @property
    def embedding_model(self) -> str:
        if self.embedding_provider == "openai":
            return self.openai_embedding_model
        return self.hf_embedding_model


def _normalize_provider(name: str, env_var: str, supported_values: set[str]) -> str:
    value = name.strip().lower()
    if value not in supported_values:
        supported = ", ".join(sorted(supported_values))
        raise ConfigError(f"{env_var} must be one of: {supported}.")
    return value


def _require_api_key(key_name: str) -> str:
    value = os.getenv(key_name, "").strip()
    if not value:
        raise ConfigError(f"{key_name} is required for the selected provider setup.")
    return value


def load_settings() -> AppConfig:
    llm_provider = _normalize_provider(
        os.getenv("LLM_PROVIDER", "openai"),
        "LLM_PROVIDER",
        SUPPORTED_LLM_PROVIDERS,
    )

    configured_embedding_provider = os.getenv("EMBEDDING_PROVIDER", "").strip().lower()
    if configured_embedding_provider:
        _normalize_provider(
            configured_embedding_provider,
            "EMBEDDING_PROVIDER",
            SUPPORTED_EMBEDDING_PROVIDERS,
        )

    expected_embedding_provider = "openai" if llm_provider == "openai" else "huggingface"
    if configured_embedding_provider and configured_embedding_provider != expected_embedding_provider:
        raise ConfigError(
            f"For LLM_PROVIDER={llm_provider}, EMBEDDING_PROVIDER must be {expected_embedding_provider}."
        )

    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()

    if llm_provider == "openai":
        openai_api_key = _require_api_key("OPENAI_API_KEY")
    if llm_provider == "groq":
        groq_api_key = _require_api_key("GROQ_API_KEY")

    frontend_origins = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGIN",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ]

    return AppConfig(
        openai_api_key=openai_api_key,
        groq_api_key=groq_api_key,
        llm_provider=llm_provider,
        embedding_provider=expected_embedding_provider,
        openai_chat_model=os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
        openai_embedding_model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        groq_chat_model=os.getenv("GROQ_CHAT_MODEL", "llama-3.1-8b-instant"),
        hf_embedding_model=os.getenv("HF_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"),
        frontend_origins=frontend_origins,
    )


settings = load_settings()
