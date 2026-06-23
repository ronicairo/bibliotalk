"""
Client minimal pour Ollama (local) : embeddings + génération de texte.
Tout est local, aucune dépendance cloud.
"""
import os
import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "qwen3-embedding:0.6b")
CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "gemma3:4b")

# Timeouts généreux : le premier appel charge le modèle en mémoire.
_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Calcule les embeddings d'une liste de textes via Ollama."""
    if not texts:
        return []
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            f"{OLLAMA_HOST}/api/embed",
            json={"model": EMBED_MODEL, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()
    return data.get("embeddings", [])


def embed_text(text: str) -> list[float]:
    """Embedding d'un seul texte."""
    out = embed_texts([text])
    return out[0] if out else []


def chat(prompt: str, system: str | None = None, temperature: float = 0.1) -> str:
    """Génère une réponse avec le modèle de chat (gemma3:4b par défaut)."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            f"{OLLAMA_HOST}/api/chat",
            json={
                "model": CHAT_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return (data.get("message", {}).get("content") or "").strip()


def is_available() -> bool:
    """Vérifie qu'Ollama répond."""
    try:
        with httpx.Client(timeout=httpx.Timeout(3.0)) as client:
            return client.get(f"{OLLAMA_HOST}/api/tags").status_code == 200
    except Exception:
        return False
