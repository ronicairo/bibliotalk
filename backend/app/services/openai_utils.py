import os
from openai import OpenAI
from typing import Optional

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def reformulate_answer(raw_answer: str, question: str, context: Optional[str] = None) -> str:
    """
    Reformule la réponse pour l'afficher joliment, SANS modifier le fond :
    - ne change pas les nombres, dates, montants, identifiants
    - n'invente rien si raw_answer est vide
    - si OpenAI n'est pas configuré : retourne une reformulation minimale locale
    """
    raw_answer = (raw_answer or "").strip()
    question = (question or "").strip()

    if not os.getenv("OPENAI_API_KEY"):
        if raw_answer:
            return f"Réponse : {raw_answer}"
        return "Je n’ai pas trouvé d’information fiable dans le document."

    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        system = (
            "Tu es un assistant qui FORMATE une réponse déjà calculée. "
            "INTERDICTION de modifier ou d'inventer des valeurs (nombres, dates, montants, identifiants). "
            "Tu peux juste introduire poliment la réponse, en français, en une ou deux phrases maximum."
        )

        user = (
            f"Question utilisateur : {question}\n"
            f"Réponse brute (à NE PAS ALTÉRER) : {raw_answer}\n"
            f"Contexte (optionnel) : {context or ''}\n\n"
            "Consigne : Reformule la présentation SANS changer le contenu de la réponse brute. "
            "Si la réponse brute est vide, réponds : \"Je n’ai pas trouvé d’information fiable dans le document.\""
        )

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
        )
        txt = (resp.choices[0].message.content or "").strip()
        # Ceinture & bretelles : si le LLM a halluciné (vide), on retombe sur la brute
        return txt or (f"Réponse : {raw_answer}" if raw_answer else "Je n’ai pas trouvé d’information fiable dans le document.")
    except Exception:
        # En cas d’erreur OpenAI, ne bloque pas la requête
        return f"Réponse : {raw_answer}" if raw_answer else "Je n’ai pas trouvé d’information fiable dans le document."