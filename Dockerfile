# Backend BiblioTalk pour Hugging Face Spaces (SDK Docker).
# HF exécute le conteneur en tant qu'utilisateur 1000 et attend l'app sur le port 7860.
FROM python:3.12-slim

# Dépendances système minimales (PyMuPDF a des wheels, rien d'autre requis)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

COPY --chown=user backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user backend/ .

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
