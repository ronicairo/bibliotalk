"""
Client pour l'API Google Gemini (chat + embeddings).
Utilisé en production (hébergement léger, sans Ollama).
Clé gratuite : https://aistudio.google.com/apikey
"""
import os
import time
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
GEMINI_EMBED_DIM = int(os.getenv("GEMINI_EMBED_DIM", "768"))
BASE = "https://generativelanguage.googleapis.com/v1beta"

_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=10.0)


def _key() -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY manquante (clé Google AI Studio).")
    return GEMINI_API_KEY


def _post_retry(client: httpx.Client, url: str, json: dict, tries: int = 4) -> httpx.Response:
    """POST avec retry sur 429/500/503 (surcharges fréquentes du free tier Gemini)."""
    delay = 1.0
    for attempt in range(tries):
        resp = client.post(url, json=json)
        if resp.status_code not in (429, 500, 503) or attempt == tries - 1:
            resp.raise_for_status()
            return resp
        time.sleep(delay)
        delay *= 2
    return resp


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embeddings via embedContent (un appel par texte ; dimension réduite à GEMINI_EMBED_DIM)."""
    if not texts:
        return []
    out: list[list[float]] = []
    url = f"{BASE}/models/{GEMINI_EMBED_MODEL}:embedContent?key={_key()}"
    with httpx.Client(timeout=_TIMEOUT) as client:
        for t in texts:
            resp = _post_retry(client, url, {
                "content": {"parts": [{"text": t}]},
                "outputDimensionality": GEMINI_EMBED_DIM,
            })
            out.append(resp.json()["embedding"]["values"])
    return out


def chat(prompt: str, system: str | None = None, temperature: float = 0.1) -> str:
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}

    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = _post_retry(client, f"{BASE}/models/{GEMINI_CHAT_MODEL}:generateContent?key={_key()}", body)
        data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        return ""


def is_available() -> bool:
    if not GEMINI_API_KEY:
        return False
    try:
        with httpx.Client(timeout=httpx.Timeout(5.0)) as client:
            return client.get(f"{BASE}/models?key={GEMINI_API_KEY}").status_code == 200
    except Exception:
        return False
