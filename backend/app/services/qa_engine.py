import os, re, numpy as np
from joblib import load
from typing import Optional
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# === BERT model ===
sbert_model = SentenceTransformer("sentence-transformers/paraphrase-MiniLM-L6-v2")

# === OpenAI wrapper ===
def reformulate_answer(raw_answer: str, question: str, context: Optional[str] = None) -> str:
    raw_answer = (raw_answer or "").strip()
    question = (question or "").strip()

    if not os.getenv("OPENAI_API_KEY"):
        # fallback local si pas de clé
        return f"Réponse : {raw_answer}" if raw_answer else "Je n’ai pas trouvé d’information fiable."

    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        system = (
            "Tu es un assistant qui FORMATE une réponse déjà calculée. "
            "⚠️ Ne modifie JAMAIS les nombres, dates, montants, identifiants. "
            "Tu peux seulement introduire la réponse de façon polie, en français."
        )

        user = (
            f"Question : {question}\n"
            f"Réponse brute (ne jamais modifier) : {raw_answer}\n"
            f"Contexte (optionnel) : {context or ''}\n\n"
            "Consigne : Reformule joliment la présentation de la réponse brute. "
            "Si la réponse brute est vide, réponds : \"Je n’ai pas trouvé d’information fiable dans le document.\""
        )

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return f"Réponse : {raw_answer}" if raw_answer else "Je n’ai pas trouvé d’information fiable."

# === Regex helpers ===
RE_DATE = re.compile(r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")
RE_MONTANT = re.compile(r"\b\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?\s?€")
RE_PHONE = re.compile(r"\b0[1-9](?:[\s.-]?\d{2}){4}\b")
RE_ALNUM_ID = re.compile(r"\b[A-Z0-9][A-Z0-9\-_/]{5,}\b", re.I)

def extract_value(question: str, context_text: str) -> Optional[str]:
    txt = " ".join(context_text.split())
    q = question.lower()

    if "date" in q or "quand" in q:
        m = RE_DATE.search(txt)
        if m: return m.group(0)

    if "montant" in q or "prix" in q or "euros" in q or "ttc" in q:
        m = RE_MONTANT.search(txt)
        if m: return m.group(0)

    if "numéro de ligne" in q or "téléphone" in q:
        m = RE_PHONE.search(txt)
        if m: return m.group(0)

    if any(k in q for k in ["numéro", "n°", "code", "référence", "identifiant", "id"]):
        m = RE_ALNUM_ID.search(txt)
        if m: return m.group(0)
        m = re.search(r"\b\d{6,}\b", txt)
        if m: return m.group(0)

    return None

def join_neighbors(chunks: list[str], idx: int, window: int = 1) -> str:
    start = max(0, idx - window)
    end = min(len(chunks), idx + window + 1)
    return "\n".join(chunks[start:end])


# === Main QA with BERT + (optionnel) reranker supervisé ===
CONF_THRESHOLD = 0.35  # seuil de confiance

def answer_with_bert(question: str, chunks: list[str], top_k: int = 5):
    if not chunks:
        return {"answer": "Document vide", "score": 0.0, "matches": [], "source": "none"}

    # Step 1 : retrieval dense (SBERT)
    q_emb = sbert_model.encode([question])
    c_emb = sbert_model.encode(chunks)
    sims = cosine_similarity(q_emb, c_emb).flatten()
    order = np.argsort(sims)[::-1][:top_k]

    candidates = [chunks[i] for i in order]
    matches = [{"text": chunks[i], "score": float(sims[i])} for i in order]

    SUP_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../models/qna_clf.joblib")
    supervised_model = load(SUP_MODEL_PATH) if os.path.exists(SUP_MODEL_PATH) else None

    # Step 2 : rerank avec le modèle supervisé si dispo
    if supervised_model:
        import pandas as pd
        pair_texts = pd.Series([f"{question} [SEP] {c}" for c in candidates])
        preds = supervised_model.predict_proba(pair_texts)[:, 1]  # proba d’être pertinent
        best_idx = int(preds.argmax())
        raw_answer = candidates[best_idx]
        final_score = float(preds[best_idx])
        source_used = "supervise"

    else:
        # fallback = top-1 SBERT
        best_idx = 0
        raw_answer = candidates[0]
        final_score = float(sims[order[0]])
        source_used = "sbert"

    # Après avoir défini raw_answer, final_score, source_used
    if final_score < CONF_THRESHOLD:
        return {
            "answer": None,
            "refined_answer": "Je n’ai pas trouvé d’information fiable dans le document pour cette question.",
            "score": final_score,
            "matches": matches,
            "source": source_used
        }

    # Sinon on reformule
    # Step 3 : contexte & reformulation
    ctx = join_neighbors(chunks, order[best_idx], window=1)
    value = extract_value(question, ctx)
    if value:
        raw_answer = value

    refined = reformulate_answer(raw_answer, question, context=ctx)

    return {
        "answer": raw_answer,
        "refined_answer": refined,
        "score": final_score,
        "matches": matches,
        "source": source_used
    }

# Alias pour compatibilité
answer_question = answer_with_bert
