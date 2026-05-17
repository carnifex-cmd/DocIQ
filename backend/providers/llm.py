from __future__ import annotations

from groq import Groq
from openai import OpenAI

from config import FALLBACK_ANSWER, settings


_openai_client: OpenAI | None = None
_groq_client: Groq | None = None


def get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=settings.groq_api_key)
    return _groq_client


def normalize_answer(answer: str) -> str:
    cleaned_answer = answer.strip()
    if not cleaned_answer:
        return FALLBACK_ANSWER
    if "could not find" in cleaned_answer.lower() and "uploaded documents" in cleaned_answer.lower():
        return FALLBACK_ANSWER
    return cleaned_answer


def generate_answer(question: str, context: str) -> str:
    system_prompt = (
        "Answer only using the provided context. "
        f"If the answer is not in the context, say: {FALLBACK_ANSWER}"
    )
    user_prompt = f"Context:\n\n{context}\n\nQuestion: {question}"

    if settings.llm_provider == "openai":
        response = get_openai_client().chat.completions.create(
            model=settings.openai_chat_model,
            temperature=0,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = response.choices[0].message.content or ""
        return normalize_answer(content)

    response = get_groq_client().chat.completions.create(
        model=settings.groq_chat_model,
        temperature=0,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = response.choices[0].message.content or ""
    return normalize_answer(content)
