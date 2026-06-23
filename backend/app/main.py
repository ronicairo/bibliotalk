import os, uuid, secrets
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import fitz  # PyMuPDF

from .services import gdpr, auth, store, rag_engine
from .services.pdf_indexer import index_pdf
from .services import llm

load_dotenv()

app = FastAPI(title="Bibliotalk API")

# Origines autorisées : configurable via CORS_ORIGINS (séparées par des virgules)
_default_origins = "http://localhost:3000,http://localhost:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.abspath(os.path.join(BASE_DIR, "../uploads"))
THUMBS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../thumbs"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)


# ---------- Démarrage : admin + migration ----------
@app.on_event("startup")
def _startup():
    admin = auth.ensure_admin()
    migrated = store.assign_orphans_to(admin["id"])
    print(f"[auth] admin={admin['email']} ; docs orphelins migrés -> {migrated}")


# ---------- Modèles ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AskIn(BaseModel):
    doc_id: str
    question: str


class RenameIn(BaseModel):
    title: str


class RoleIn(BaseModel):
    role: str


class FolderIn(BaseModel):
    name: str


class MoveIn(BaseModel):
    folder: str | None = None


# ---------- Helpers ----------
def generate_thumbnail(pdf_path: str, out_dir: str, base_name: str, target_width: int = 320) -> str:
    doc = fitz.open(pdf_path)
    page = doc[0]
    scale = max(0.1, min(4.0, target_width / page.rect.width))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    thumb_name = os.path.splitext(base_name)[0] + ".png"
    pix.save(os.path.join(out_dir, thumb_name))
    doc.close()
    return thumb_name


def _doc_payload(doc_id: str, meta: dict) -> dict:
    return {
        "doc_id": doc_id,
        "metadata": {"title": meta.get("title"), "pages": meta.get("pages")},
        "file_name": meta.get("file_name"),
        "file_url": f"/doc/{doc_id}/file",
        "thumb_url": f"/doc/{doc_id}/thumb" if meta.get("thumb_name") else None,
        "shared": bool(meta.get("share_token")),
        "share_token": meta.get("share_token"),
        "folder": meta.get("folder"),
        "created_at": meta.get("created_at"),
    }


def _owned_meta(doc_id: str, user: dict) -> dict:
    meta = store.get_meta(doc_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if meta.get("owner") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return meta


def _user_from_request(token_q: str | None, authorization: str | None) -> dict:
    """Résout l'utilisateur depuis ?token= OU l'en-tête Authorization (pour <img>/pdf.js)."""
    token = token_q
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    user = auth.user_from_token_value(token)
    if not user:
        raise HTTPException(status_code=401, detail="Non authentifié")
    return user


# ---------- Santé ----------
@app.get("/health")
async def health():
    return {"status": "ok", "available": llm.is_available(), **llm.info()}


# ---------- Auth ----------
@app.post("/auth/register")
async def register(payload: RegisterIn):
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (6 caractères minimum)")
    try:
        user = auth.create_user(payload.email, payload.password, role="user")
    except ValueError:
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email")
    return {"token": auth.create_token(user), "user": auth.public(user)}


@app.post("/auth/login")
async def login(payload: LoginIn):
    user = auth.get_by_email(payload.email)
    if not user or not auth.verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return {"token": auth.create_token(user), "user": auth.public(user)}


@app.get("/auth/me")
async def me(user: dict = Depends(auth.get_current_user)):
    return auth.public(user)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@app.post("/auth/change_password")
async def change_password(payload: PasswordIn, user: dict = Depends(auth.get_current_user)):
    if not auth.verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nouveau mot de passe trop court (6 caractères minimum)")
    auth.update_password(user["id"], payload.new_password)
    return {"status": "ok"}


@app.delete("/auth/me")
async def delete_account(user: dict = Depends(auth.get_current_user)):
    """Supprime le compte et TOUTES ses données (documents, fichiers, dossiers, partages)."""
    for doc_id, meta in list(store.list_library().items()):
        if meta.get("owner") == user["id"]:
            store.delete_doc(doc_id)
            for path in (meta.get("file_path"),
                         os.path.join(THUMBS_DIR, meta["thumb_name"]) if meta.get("thumb_name") else None):
                try:
                    if path and os.path.exists(path):
                        os.remove(path)
                except Exception:
                    pass
    for f in store.list_folders_for_owner(user["id"]):
        store.delete_folder(f["id"])
    auth.delete_user(user["id"])
    return {"status": "ok"}


# ---------- Upload + indexation (privé) ----------
MAX_FILES_PER_USER = int(os.getenv("MAX_FILES_PER_USER", "10"))


@app.post("/upload")
async def upload(file: UploadFile = File(...), folder: str | None = Form(None), user: dict = Depends(auth.get_current_user)):
    # Limite du nombre de documents par utilisateur (hors corbeille)
    if len(store.list_library_for_owner(user["id"], deleted=False)) >= MAX_FILES_PER_USER:
        raise HTTPException(status_code=403, detail=f"Limite atteinte : {MAX_FILES_PER_USER} documents maximum. Supprime un document pour en importer un nouveau.")
    ext = os.path.splitext(file.filename)[1] or ".pdf"
    content = await file.read()

    tmp_path = os.path.join(UPLOAD_DIR, f"_tmp_{uuid.uuid4().hex}{ext}")
    with open(tmp_path, "wb") as f:
        f.write(content)

    try:
        info = index_pdf(tmp_path)
    except Exception as e:
        os.remove(tmp_path)
        raise HTTPException(status_code=400, detail=f"PDF illisible : {e}")

    doc_id = info["doc_id"]
    chunks = info["chunks"]

    try:
        embeddings = llm.embed_texts([c["text"] for c in chunks])
    except Exception as e:
        os.remove(tmp_path)
        return JSONResponse({"error": f"Échec du calcul des embeddings : {e}"}, status_code=503)

    # Renommage par doc_id (évite les collisions de noms entre utilisateurs)
    final_pdf = os.path.join(UPLOAD_DIR, f"{doc_id}{ext}")
    os.replace(tmp_path, final_pdf)
    thumb_name = generate_thumbnail(final_pdf, THUMBS_DIR, f"{doc_id}{ext}")

    meta = {
        "title": info["metadata"].get("title") or file.filename,
        "pages": info["metadata"].get("pages"),
        "file_name": file.filename,
        "file_path": final_pdf,
        "thumb_name": thumb_name,
        "n_chunks": len(chunks),
        "owner": user["id"],
        "folder": folder or None,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    store.save_doc(doc_id, meta, chunks, embeddings)

    payload = _doc_payload(doc_id, meta)
    payload["chunks"] = len(chunks)
    return payload


# ---------- Q&A (privé) ----------
@app.post("/ask")
async def ask(payload: AskIn, user: dict = Depends(auth.get_current_user)):
    _owned_meta(payload.doc_id, user)
    result = rag_engine.answer(payload.doc_id, payload.question)
    return {"doc_id": payload.doc_id, "question": payload.question,
            "answer": result["answer"], "matches": result["matches"]}


# ---------- CRUD documents (privé) ----------
@app.get("/list_docs")
async def list_docs(user: dict = Depends(auth.get_current_user)):
    return [_doc_payload(d, m) for d, m in store.list_library_for_owner(user["id"]).items()]


@app.get("/doc/{doc_id}")
async def get_doc_info(doc_id: str, user: dict = Depends(auth.get_current_user)):
    return _doc_payload(doc_id, _owned_meta(doc_id, user))


@app.get("/doc/{doc_id}/file")
async def get_doc_file(doc_id: str, token: str | None = Query(None), authorization: str | None = Header(None)):
    user = _user_from_request(token, authorization)
    meta = _owned_meta(doc_id, user)
    path = meta.get("file_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier absent")
    return FileResponse(path, media_type="application/pdf", filename=meta.get("file_name"))


@app.get("/doc/{doc_id}/thumb")
async def get_doc_thumb(doc_id: str, token: str | None = Query(None), authorization: str | None = Header(None)):
    user = _user_from_request(token, authorization)
    meta = _owned_meta(doc_id, user)
    if not meta.get("thumb_name"):
        raise HTTPException(status_code=404, detail="Pas de miniature")
    path = os.path.join(THUMBS_DIR, meta["thumb_name"])
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Miniature absente")
    return FileResponse(path, media_type="image/png")


@app.delete("/doc/{doc_id}")
async def delete_doc(doc_id: str, user: dict = Depends(auth.get_current_user)):
    """Mise à la corbeille (réversible). Désactive aussi le lien de partage."""
    _owned_meta(doc_id, user)
    store.soft_delete(doc_id)
    return {"status": "ok"}


@app.get("/trash")
async def list_trash(user: dict = Depends(auth.get_current_user)):
    return [_doc_payload(d, m) for d, m in store.list_library_for_owner(user["id"], deleted=True).items()]


@app.post("/doc/{doc_id}/restore")
async def restore_doc(doc_id: str, user: dict = Depends(auth.get_current_user)):
    _owned_meta(doc_id, user)
    meta = store.restore(doc_id)
    return {"status": "ok", "doc": _doc_payload(doc_id, meta)}


@app.delete("/doc/{doc_id}/permanent")
async def delete_doc_permanent(doc_id: str, user: dict = Depends(auth.get_current_user)):
    """Suppression définitive (fichiers + index)."""
    _owned_meta(doc_id, user)
    meta = store.delete_doc(doc_id)
    for path in (meta.get("file_path"),
                 os.path.join(THUMBS_DIR, meta["thumb_name"]) if meta.get("thumb_name") else None):
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
    return {"status": "ok"}


@app.patch("/doc/{doc_id}/rename")
async def rename_doc(doc_id: str, payload: RenameIn, user: dict = Depends(auth.get_current_user)):
    current = _owned_meta(doc_id, user)
    new_title = payload.title.strip() or current.get("title")
    meta = store.update_meta(doc_id, title=new_title)
    return {"status": "ok", "doc": _doc_payload(doc_id, meta)}


# ---------- Dossiers ----------
def _owned_folder(folder_id: str, user: dict) -> dict:
    folder = store.get_folder(folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    if folder.get("owner") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    return folder


@app.get("/folders")
async def list_folders(user: dict = Depends(auth.get_current_user)):
    return store.list_folders_for_owner(user["id"])


@app.post("/folders")
async def create_folder(payload: FolderIn, user: dict = Depends(auth.get_current_user)):
    return store.create_folder(user["id"], payload.name)


@app.patch("/folders/{folder_id}")
async def rename_folder(folder_id: str, payload: FolderIn, user: dict = Depends(auth.get_current_user)):
    _owned_folder(folder_id, user)
    return store.rename_folder(folder_id, payload.name)


@app.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, user: dict = Depends(auth.get_current_user)):
    _owned_folder(folder_id, user)
    store.delete_folder(folder_id)
    return {"status": "ok"}


@app.patch("/doc/{doc_id}/move")
async def move_doc(doc_id: str, payload: MoveIn, user: dict = Depends(auth.get_current_user)):
    _owned_meta(doc_id, user)
    if payload.folder:
        _owned_folder(payload.folder, user)  # valide la propriété du dossier cible
    meta = store.update_meta(doc_id, folder=payload.folder)
    return {"status": "ok", "doc": _doc_payload(doc_id, meta)}


# ---------- Partage public (lecture du PDF par lien) ----------
class ShareAskIn(BaseModel):
    question: str


def _shared_meta(token: str) -> tuple[str, dict]:
    res = store.get_by_share_token(token)
    if not res:
        raise HTTPException(status_code=404, detail="Lien de partage invalide ou révoqué")
    return res


@app.post("/doc/{doc_id}/share")
async def create_share(doc_id: str, user: dict = Depends(auth.get_current_user)):
    """Le propriétaire active un lien public (lecture seule) pour ce document."""
    meta = _owned_meta(doc_id, user)
    token = meta.get("share_token") or secrets.token_urlsafe(16)
    store.update_meta(doc_id, share_token=token)
    return {"share_token": token, "share_path": f"/share/{token}"}


@app.delete("/doc/{doc_id}/share")
async def revoke_share(doc_id: str, user: dict = Depends(auth.get_current_user)):
    _owned_meta(doc_id, user)
    store.update_meta(doc_id, share_token=None)
    return {"status": "ok"}


@app.get("/share/{token}")
async def shared_doc_info(token: str):
    """Infos publiques d'un document partagé (pas d'auth)."""
    _doc_id, meta = _shared_meta(token)
    return {
        "title": meta.get("title"),
        "pages": meta.get("pages"),
        "file_name": meta.get("file_name"),
        "file_url": f"/share/{token}/file",
    }


@app.get("/share/{token}/file")
async def shared_file(token: str):
    """Sert le PDF partagé (lecture publique, sans compte)."""
    _doc_id, meta = _shared_meta(token)
    path = meta.get("file_path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Fichier absent")
    return FileResponse(path, media_type="application/pdf", filename=meta.get("file_name"))


@app.post("/share/{token}/ask")
async def shared_ask(token: str, payload: ShareAskIn, user: dict = Depends(auth.get_current_user)):
    """Poser une question sur un document partagé : réservé aux utilisateurs INSCRITS."""
    doc_id, _meta = _shared_meta(token)
    result = rag_engine.answer(doc_id, payload.question)
    return {"answer": result["answer"], "matches": result["matches"]}


@app.post("/share/{token}/save")
async def save_shared(token: str, user: dict = Depends(auth.get_current_user)):
    """Ajoute un lien partagé ouvert à l'onglet 'Partagés avec moi' de l'utilisateur."""
    _doc_id, meta = _shared_meta(token)
    if meta.get("owner") != user["id"]:  # on n'ajoute pas ses propres documents
        auth.add_received_share(user["id"], token)
    return {"status": "ok"}


@app.get("/shared_with_me")
async def shared_with_me(user: dict = Depends(auth.get_current_user)):
    """Documents partagés avec l'utilisateur (liens ouverts). Nettoie les liens révoqués."""
    out = []
    for token in auth.list_received_shares(user["id"]):
        res = store.get_by_share_token(token)
        if not res:
            auth.remove_received_share(user["id"], token)  # lien révoqué -> on retire
            continue
        _doc_id, meta = res
        owner = auth.get_by_id(meta.get("owner"))
        out.append({
            "token": token,
            "title": meta.get("title"),
            "pages": meta.get("pages"),
            "owner_email": owner["email"] if owner else "?",
            "file_url": f"/share/{token}/file",
            "share_url": f"/share/{token}",
        })
    return out


@app.delete("/shared_with_me/{token}")
async def remove_shared_with_me(token: str, user: dict = Depends(auth.get_current_user)):
    auth.remove_received_share(user["id"], token)
    return {"status": "ok"}


# ---------- Admin : gestion des utilisateurs ----------
@app.get("/admin/users")
async def admin_list_users(_: dict = Depends(auth.require_admin)):
    return auth.list_users()


@app.patch("/admin/users/{user_id}/role")
async def admin_set_role(user_id: str, payload: RoleIn, _: dict = Depends(auth.require_admin)):
    if payload.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide")
    updated = auth.set_role(user_id, payload.role)
    if not updated:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return updated


@app.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(auth.require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    deleted = auth.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"status": "ok", "deleted": deleted}


# ---------- GDPR ----------
app.include_router(gdpr.router, prefix="/gdpr", tags=["gdpr"])
