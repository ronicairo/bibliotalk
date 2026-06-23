"""
Persistance disque de la bibliothèque + des index RAG.

- data/library.json        : métadonnées de tous les documents
- data/index/<doc_id>.json : passages {text, page} du document
- data/index/<doc_id>.npy  : matrice d'embeddings (1 ligne par passage)

L'objet en mémoire DOCS est reconstruit au démarrage à partir de ces fichiers.
"""
import os
import json
import uuid
import threading
import datetime as _dt
import numpy as np

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../data"))
INDEX_DIR = os.path.join(DATA_DIR, "index")
LIBRARY_PATH = os.path.join(DATA_DIR, "library.json")
FOLDERS_PATH = os.path.join(DATA_DIR, "folders.json")

os.makedirs(INDEX_DIR, exist_ok=True)

_lock = threading.Lock()


def _load_library() -> dict:
    if not os.path.exists(LIBRARY_PATH):
        return {}
    try:
        with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_library(library: dict) -> None:
    tmp = LIBRARY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(library, f, ensure_ascii=False, indent=2)
    os.replace(tmp, LIBRARY_PATH)


def save_doc(doc_id: str, meta: dict, chunks: list[dict], embeddings: list[list[float]]) -> None:
    """Persiste un document : métadonnées + passages + embeddings."""
    with _lock:
        # passages
        with open(os.path.join(INDEX_DIR, f"{doc_id}.json"), "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False)
        # embeddings
        arr = np.array(embeddings, dtype=np.float32)
        np.save(os.path.join(INDEX_DIR, f"{doc_id}.npy"), arr)
        # library
        library = _load_library()
        library[doc_id] = meta
        _save_library(library)


def load_chunks(doc_id: str) -> list[dict]:
    path = os.path.join(INDEX_DIR, f"{doc_id}.json")
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_embeddings(doc_id: str) -> np.ndarray:
    path = os.path.join(INDEX_DIR, f"{doc_id}.npy")
    if not os.path.exists(path):
        return np.zeros((0, 0), dtype=np.float32)
    return np.load(path)


def list_library() -> dict:
    with _lock:
        return _load_library()


def list_library_for_owner(owner_id: str, deleted: bool = False) -> dict:
    """Documents d'un utilisateur. deleted=False -> bibliothèque ; True -> corbeille."""
    with _lock:
        return {
            k: v for k, v in _load_library().items()
            if v.get("owner") == owner_id and bool(v.get("deleted")) == deleted
        }


def soft_delete(doc_id: str) -> dict | None:
    """Met le document à la corbeille (sans toucher aux fichiers)."""
    import datetime as _dt
    return update_meta(doc_id, deleted=True, deleted_at=_dt.datetime.now().isoformat(timespec="seconds"))


def restore(doc_id: str) -> dict | None:
    """Sort le document de la corbeille."""
    return update_meta(doc_id, deleted=False, deleted_at=None)


# ---------- Dossiers ----------
def _load_folders() -> dict:
    if not os.path.exists(FOLDERS_PATH):
        return {}
    try:
        with open(FOLDERS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_folders(folders: dict) -> None:
    tmp = FOLDERS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(folders, f, ensure_ascii=False, indent=2)
    os.replace(tmp, FOLDERS_PATH)


def create_folder(owner_id: str, name: str) -> dict:
    with _lock:
        folders = _load_folders()
        folder = {"id": str(uuid.uuid4()), "owner": owner_id, "name": name.strip() or "Dossier",
                  "created_at": _dt.datetime.now().isoformat(timespec="seconds")}
        folders[folder["id"]] = folder
        _save_folders(folders)
    return folder


def list_folders_for_owner(owner_id: str) -> list[dict]:
    with _lock:
        return [f for f in _load_folders().values() if f.get("owner") == owner_id]


def get_folder(folder_id: str) -> dict | None:
    return _load_folders().get(folder_id)


def rename_folder(folder_id: str, name: str) -> dict | None:
    with _lock:
        folders = _load_folders()
        if folder_id not in folders:
            return None
        folders[folder_id]["name"] = name.strip() or folders[folder_id]["name"]
        _save_folders(folders)
        return folders[folder_id]


def delete_folder(folder_id: str) -> bool:
    """Supprime un dossier ; ses documents repassent à la racine."""
    with _lock:
        folders = _load_folders()
        if folder_id not in folders:
            return False
        folders.pop(folder_id)
        _save_folders(folders)
        # Détache les documents de ce dossier
        library = _load_library()
        changed = False
        for meta in library.values():
            if meta.get("folder") == folder_id:
                meta["folder"] = None
                changed = True
        if changed:
            _save_library(library)
        return True


def assign_orphans_to(owner_id: str) -> int:
    """Attribue tout document sans propriétaire à owner_id. Retourne le nb migré."""
    with _lock:
        library = _load_library()
        n = 0
        for meta in library.values():
            if not meta.get("owner"):
                meta["owner"] = owner_id
                n += 1
        if n:
            _save_library(library)
        return n


def get_meta(doc_id: str) -> dict | None:
    return _load_library().get(doc_id)


def get_by_share_token(token: str) -> tuple[str, dict] | None:
    """Retrouve (doc_id, meta) à partir d'un token de partage public."""
    if not token:
        return None
    for doc_id, meta in _load_library().items():
        if meta.get("share_token") == token and not meta.get("deleted"):
            return doc_id, meta
    return None


def update_meta(doc_id: str, **fields) -> dict | None:
    with _lock:
        library = _load_library()
        if doc_id not in library:
            return None
        library[doc_id].update(fields)
        _save_library(library)
        return library[doc_id]


def delete_doc(doc_id: str) -> dict | None:
    with _lock:
        library = _load_library()
        meta = library.pop(doc_id, None)
        if meta is not None:
            _save_library(library)
        for ext in (".json", ".npy"):
            p = os.path.join(INDEX_DIR, f"{doc_id}{ext}")
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
        return meta
