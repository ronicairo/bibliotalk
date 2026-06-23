---
title: BiblioTalk API
emoji: 📚
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# BiblioTalk

Bibliothèque intelligente : range tes PDF et interroge-les avec une IA (RAG).

- **Frontend** (React) : hébergé sur bibliotalk.fr
- **Backend** (FastAPI) : ce Space Hugging Face

## Variables d'environnement (à définir dans Settings → Variables and secrets)

| Clé | Type | Valeur |
|-----|------|--------|
| `LLM_PROVIDER` | variable | `gemini` |
| `GEMINI_API_KEY` | secret | ta clé Google AI Studio |
| `ADMIN_HASH` | secret | hash bcrypt du compte admin |
| `JWT_SECRET` | secret | longue chaîne aléatoire |
| `CORS_ORIGINS` | variable | `https://bibliotalk.fr,https://www.bibliotalk.fr` |
| `ADMIN_EMAIL` | variable | `roni.cairo@outlook.fr` |
| `MAX_FILES_PER_USER` | variable | `10` |
