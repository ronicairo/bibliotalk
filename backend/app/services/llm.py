"""
Aiguillage du fournisseur LLM (chat + embeddings).

- LLM_PROVIDER=ollama (défaut) -> 100% local, privé (développement)
- LLM_PROVIDER=gemini          -> API Google Gemini (production, hébergement léger)

Le reste du code (rag_engine, main) n'appelle QUE ce module, jamais les clients directement.
"""
import os

PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()
# Le fournisseur cloud envoie les extraits de PDF à un tiers -> avertir l'utilisateur.
IS_CLOUD = PROVIDER != "ollama"


def _backend():
    if PROVIDER == "gemini":
        from . import gemini_client
        return gemini_client
    from . import ollama_client
    return ollama_client


def embed_texts(texts: list[str]) -> list[list[float]]:
    return _backend().embed_texts(texts)


def embed_text(text: str) -> list[float]:
    out = embed_texts([text])
    return out[0] if out else []


def chat(prompt: str, system: str | None = None, temperature: float = 0.1) -> str:
    return _backend().chat(prompt, system=system, temperature=temperature)


def is_available() -> bool:
    return _backend().is_available()


def info() -> dict:
    b = _backend()
    if PROVIDER == "gemini":
        return {"provider": "gemini", "chat_model": b.GEMINI_CHAT_MODEL, "embed_model": b.GEMINI_EMBED_MODEL, "is_cloud": True}
    return {"provider": "ollama", "chat_model": b.CHAT_MODEL, "embed_model": b.EMBED_MODEL, "is_cloud": False}
