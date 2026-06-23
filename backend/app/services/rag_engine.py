"""
Moteur RAG : recherche hybride (dense + mots-clés BM25) puis réponse par gemma3:4b.

Pipeline :
  question
    ├─ recherche dense  : embeddings (qwen3) + similarité cosinus
    ├─ recherche BM25   : mots-clés exacts (dates, montants, n°, noms propres)
    └─ fusion des scores ─► top-k passages ─► gemma3:4b rédige la réponse + cite les pages
"""
import re
import numpy as np

from . import llm
from .store import load_chunks, load_embeddings
from rank_bm25 import BM25Okapi

TOP_K = 5  # nombre de passages envoyés au modèle

SYSTEM_PROMPT = (
    "Tu es un assistant qui répond à des questions sur un document PDF. "
    "Réponds UNIQUEMENT à partir des extraits fournis, en français, de façon claire et concise. "
    "Si l'information ne figure pas dans les extraits, réponds exactement : "
    "\"Je n'ai pas trouvé cette information dans le document.\" "
    "Ne fabrique jamais de chiffres, dates ou noms. Quand c'est pertinent, indique la page (ex. : « (p. 3) »)."
)


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def _normalize(scores: np.ndarray) -> np.ndarray:
    if scores.size == 0:
        return scores
    lo, hi = float(scores.min()), float(scores.max())
    if hi - lo < 1e-9:
        return np.zeros_like(scores)
    return (scores - lo) / (hi - lo)


def retrieve(doc_id: str, question: str, top_k: int = TOP_K) -> list[dict]:
    """Retourne les passages les plus pertinents avec leur score fusionné."""
    chunks = load_chunks(doc_id)
    if not chunks:
        return []
    texts = [c["text"] for c in chunks]

    # --- Recherche dense (embeddings) ---
    emb = load_embeddings(doc_id)
    dense = np.zeros(len(texts), dtype=np.float32)
    if emb.shape[0] == len(texts) and emb.shape[0] > 0:
        q = np.array(llm.embed_text(question), dtype=np.float32)
        if q.size:
            norms = np.linalg.norm(emb, axis=1) * (np.linalg.norm(q) + 1e-9)
            dense = (emb @ q) / (norms + 1e-9)

    # --- Recherche mots-clés (BM25) ---
    bm25 = BM25Okapi([_tokenize(t) for t in texts])
    sparse = np.array(bm25.get_scores(_tokenize(question)), dtype=np.float32)

    # --- Fusion (dense pondéré + mots-clés) ---
    fused = 0.65 * _normalize(dense) + 0.35 * _normalize(sparse)
    order = np.argsort(fused)[::-1][:top_k]

    return [
        {
            "text": chunks[i]["text"],
            "page": chunks[i].get("page"),
            "score": float(fused[i]),
        }
        for i in order
    ]


def answer(doc_id: str, question: str, top_k: int = TOP_K) -> dict:
    """Recherche les passages puis fait rédiger la réponse par gemma3:4b."""
    matches = retrieve(doc_id, question, top_k=top_k)
    if not matches:
        return {
            "answer": "Je n'ai pas trouvé cette information dans le document.",
            "matches": [],
        }

    context = "\n\n".join(
        f"[Extrait {i + 1} — page {m.get('page', '?')}]\n{m['text']}"
        for i, m in enumerate(matches)
    )
    prompt = (
        f"Question : {question}\n\n"
        f"Extraits du document :\n{context}\n\n"
        "Réponds à la question en te basant uniquement sur ces extraits."
    )

    try:
        text = llm.chat(prompt, system=SYSTEM_PROMPT)
    except Exception as e:
        text = f"Le service de réponse est momentanément indisponible, réessaie dans un instant. ({e})"

    return {"answer": text, "matches": matches}
