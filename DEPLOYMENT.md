# Déploiement BiblioTalk — Guide complet

> Document de référence pour comprendre et opérer le déploiement.
> À relire en cas de perte de contexte.

## 1. Vue d'ensemble

L'application a **deux moitiés** hébergées à deux endroits différents :

```
bibliotalk.fr  (Hostinger mutualisé)   →  le SITE React (fichiers statiques dans public_html)
bibliotalk-api.onrender.com (Render)   →  le BACKEND FastAPI (Python, RAG, comptes, appels Gemini)
```

- **Code source** : https://github.com/ronicairo/bibliotalk (branche `main`)
- **Site public** : https://bibliotalk.fr
- **API** : https://bibliotalk-api.onrender.com (test : `/health`)
- **IA** : Google **Gemini** en prod (chat `gemini-2.5-flash`, embeddings `gemini-embedding-001`). En local : **Ollama** (`gemma3:4b`).

Pourquoi deux hébergeurs : Hostinger mutualisé ne peut PAS exécuter de serveur Python permanent → le backend va sur Render. Hostinger ne sert que le site compilé.

## 2. Comment se fait le déploiement (CI/CD)

**Tout part d'un `git push` sur `main`.**

### Backend (Render) — automatique
- Render est connecté au dépôt GitHub. À chaque push qui touche `backend/`, Render **rebuild et redéploie tout seul**.
- Config dans `render.yaml` (à la racine). Plan **Free**.

### Frontend (Hostinger) — automatique via GitHub Actions
- Workflow : `.github/workflows/deploy-hostinger.yml`.
- Déclenché à chaque push qui touche `frontend/**` (ou manuellement, voir §3).
- Étapes : `npm ci` → `npm run build` (avec `REACT_APP_API_URL` = l'URL Render) → **upload FTP** du dossier `frontend/build/` vers `public_html`.

```
git push (frontend) ──► GitHub Action : build React + FTP ──► Hostinger public_html
git push (backend)  ──► Render : rebuild + redeploy
```

## 3. Lancer un déploiement manuellement (frontend)

Si besoin de redéployer le site sans changement de code :
1. GitHub → onglet **Actions** : https://github.com/ronicairo/bibliotalk/actions
2. Colonne de gauche → **« Déploiement du site sur Hostinger »**
3. Bouton **« Run workflow »** (en haut à droite) → branche `main` → **Run workflow**.
4. ~2-3 min plus tard : 🟢 vert = en ligne, 🔴 rouge = voir le log.

Pour le backend : Render → le service `bibliotalk-api` → **Manual Deploy** → **Deploy latest commit**.

## 4. Vérifier que c'est déployé

```bash
# Le site répond et sert la bonne version ?
curl -s https://bibliotalk.fr | grep -o "<title>[^<]*</title>"

# Quel build JS est servi (change à chaque déploiement) ?
curl -s "https://bibliotalk.fr/?x=$RANDOM" | grep -o 'static/js/main[^"]*\.js'

# L'API tourne et Gemini est OK ?
curl -s https://bibliotalk-api.onrender.com/health
# attendu : {"status":"ok","available":true,"provider":"gemini",...,"is_cloud":true}

# État des runs GitHub Actions (public, sans auth) :
curl -s "https://api.github.com/repos/ronicairo/bibliotalk/actions/runs?per_page=3" \
  | python3 -c "import sys,json;[print(r['status'],r.get('conclusion'),r['head_sha'][:7]) for r in json.load(sys.stdin)['workflow_runs']]"
```

> ⚠️ Le navigateur **met le site en cache**. Après un déploiement, faire **Cmd+Shift+R** pour voir la nouvelle version (les visiteurs neufs voient toujours la dernière).

## 5. Variables d'environnement (secrets)

### Sur Render (réglages du service `bibliotalk-api` → Environment)
| Clé | Rôle |
|-----|------|
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | clé Google AI Studio (https://aistudio.google.com/apikey) |
| `ADMIN_HASH` | hash bcrypt du compte admin (`roni.cairo@outlook.fr`) |
| `JWT_SECRET` | généré auto par Render |
| `CORS_ORIGINS` | `https://bibliotalk.fr,https://www.bibliotalk.fr` |
| `ADMIN_EMAIL` | `roni.cairo@outlook.fr` |
| `MAX_FILES_PER_USER` | `10` |

### Sur GitHub (Settings → Secrets and variables → Actions) — pour le déploiement FTP
| Secret | Valeur |
|--------|--------|
| `FTP_SERVER` | `89.116.147.167` (IP, sans `ftp://`) |
| `FTP_USERNAME` | `u230803854.bibliotalk.fr` |
| `FTP_PASSWORD` | mot de passe FTP (hPanel → Comptes FTP) |

> ⚠️ Aucun secret n'est dans le code (vérifié par `.gitignore`). `.env`, `.claude/settings.local.json`, `backend/data/` sont ignorés.

## 6. Développement local

Deux terminaux (voir aussi le README) :
```bash
# Backend (mode local = Ollama, privé, gratuit)
cd backend && source ../.venv/bin/activate && uvicorn app.main:app --port 8000
#   nécessite Ollama lancé + modèles gemma3:4b et qwen3-embedding:0.6b

# Frontend
cd frontend && npm start    # http://localhost:3000, parle à localhost:8000
```
En local, `REACT_APP_API_URL` n'est pas défini → l'app vise `http://localhost:8000`.
Pour tester Gemini en local : lancer uvicorn avec `LLM_PROVIDER=gemini` (clé dans `backend/.env`).

## 7. Pièges rencontrés (et solutions) — IMPORTANT

- **PDF blanc en prod, OK en local** : le worker pdf.js bundlé par CRA était du CommonJS (`require is not defined`). → **Solution** : charger le worker depuis cdnjs dans `ReaderPage`/`SharePage` :
  `pdfjsLib.GlobalWorkerOptions.workerSrc = \`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js\``
- **Déploiement FTP qui échoue** : un **gros fichier (>1 Mo) dans `frontend/public/`** fait planter/expirer l'upload FTP → le run échoue. **Ne pas mettre de gros binaires dans `public/`.**
- **Site déployé dans `public_html/public_html/`** : le compte FTP (`u230803854.bibliotalk.fr`) pointe DÉJÀ sur `public_html`. Dans le workflow, `server-dir: ./` (la racine), PAS `public_html/`.
- **Pages `/login` `/library` en 404 au rafraîchissement** : routage SPA. Le fichier `frontend/public/.htaccess` réécrit tout vers `index.html` (copié dans le build).
- **CI=false dans le workflow** : sinon GitHub Actions transforme les warnings ESLint en erreurs et le build échoue.
- **1ère requête lente (~50 s)** : Render Free s'endort après 15 min d'inactivité ; le réveil prend ~50 s. Normal.
- **Données réinitialisées** : Render Free a un disque **éphémère** → comptes/fichiers perdus à un redémarrage/redéploiement. Limite à 10 fichiers/user. Pour de la persistance : VPS ou plan payant (le code ne change pas).

## 8. Confidentialité

En mode cloud (Gemini), des **extraits de PDF sont envoyés à Google** pour générer les réponses → un bandeau d'avertissement s'affiche dans le lecteur. Mentionné aussi dans la page `/privacy`.
