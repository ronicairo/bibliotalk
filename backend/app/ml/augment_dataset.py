import pandas as pd
import random

# Quelques paraphrases génériques
SYNONYMS = {
    "quel": ["quel", "donne-moi", "indique", "peux-tu me dire", "fournis-moi"],
    "titre": ["titre", "nom du document", "intitulé"],
    "technologies": ["technologies", "outils", "frameworks", "libs"],
    "backend": ["backend", "côté serveur", "API", "FastAPI"],
    "mobile": ["mobile", "application mobile", "front mobile", "Expo"],
    "étapes": ["étapes", "procédure", "instructions", "démarrage"],
    "cas": ["cas", "situations", "scénarios"],
    "options": ["options", "choix", "possibilités"],
}

def paraphrase(question: str, n_variants: int = 5):
    """Crée n_variants paraphrases basées sur la question d'origine."""
    variants = set([question])  # garder la question originale
    words = question.split()
    for _ in range(n_variants):
        new_q = []
        for w in words:
            lw = w.lower().strip("?,.")
            if lw in SYNONYMS:
                new_q.append(random.choice(SYNONYMS[lw]))
            else:
                new_q.append(w)
        variants.add(" ".join(new_q))
    return list(variants)

# Charger le dataset original
df = pd.read_csv("backend/data/qna_dataset.csv")

# Nouveau dataframe
rows = []

for _, row in df.iterrows():
    qs = paraphrase(row["question"], n_variants=5)  # 5 variantes par question
    for q in qs:
        rows.append({"question": q, "chunk": row["chunk"], "label": row["label"]})

df_aug = pd.DataFrame(rows)

# Sauvegarde
out_path = "backend/data/qna_dataset_augmented.csv"
df_aug.to_csv(out_path, index=False)
print(f"✅ Dataset augmenté sauvegardé : {out_path}")
print(f"Nombre de lignes : {len(df_aug)} (au lieu de {len(df)})")
