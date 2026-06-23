"""
Authentification : comptes utilisateurs (users.json), bcrypt, JWT.

- Inscription ouverte (rôle 'user').
- Compte admin pré-créé au démarrage.
- Les fichiers sont cloisonnés par propriétaire (voir store.py / main.py).
"""
import os
import json
import uuid
import threading
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, "../../data"))
USERS_PATH = os.path.join(DATA_DIR, "users.json")
os.makedirs(DATA_DIR, exist_ok=True)

JWT_SECRET = os.getenv("JWT_SECRET", "bibliotalk-dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_TTL_DAYS = 7

# Compte admin pré-créé (hash bcrypt fourni, format $2y$ supporté)
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "roni.cairo@outlook.fr")
ADMIN_HASH = os.getenv(
    "ADMIN_HASH",
    "$2y$10$9W1I/ifxOx6v9Wyo4/qfy.fWd2xaeMYlKiDNCStgd5pgwJvW6R2zK",
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)
_lock = threading.Lock()


# ---------- Persistance ----------
def _load() -> dict:
    if not os.path.exists(USERS_PATH):
        return {}
    try:
        with open(USERS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(users: dict) -> None:
    tmp = USERS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
    os.replace(tmp, USERS_PATH)


# ---------- Mots de passe ----------
def _normalize_hash(h: str) -> str:
    # $2y$ (PHP) == $2b$ algorithmiquement ; bcrypt-python attend $2a/$2b.
    return ("$2b$" + h[4:]) if h.startswith("$2y$") else h


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), _normalize_hash(hashed).encode())
    except Exception:
        return False


# ---------- JWT ----------
def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return None


# ---------- Opérations comptes ----------
def get_by_email(email: str) -> dict | None:
    return _load().get(email.lower().strip())


def get_by_id(user_id: str) -> dict | None:
    for u in _load().values():
        if u["id"] == user_id:
            return u
    return None


def create_user(email: str, password: str, role: str = "user") -> dict:
    email = email.lower().strip()
    with _lock:
        users = _load()
        if email in users:
            raise ValueError("email_exists")
        user = {
            "id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password(password),
            "role": role,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        users[email] = user
        _save(users)
    return user


def list_users() -> list[dict]:
    return [_public(u) for u in _load().values()]


def set_role(user_id: str, role: str) -> dict | None:
    with _lock:
        users = _load()
        for email, u in users.items():
            if u["id"] == user_id:
                u["role"] = role
                _save(users)
                return _public(u)
    return None


def delete_user(user_id: str) -> dict | None:
    with _lock:
        users = _load()
        for email, u in list(users.items()):
            if u["id"] == user_id:
                users.pop(email)
                _save(users)
                return _public(u)
    return None


def add_received_share(user_id: str, token: str) -> None:
    """Mémorise qu'un utilisateur a ouvert un lien partagé (onglet 'Partagés avec moi')."""
    with _lock:
        users = _load()
        for u in users.values():
            if u["id"] == user_id:
                shares = u.setdefault("received_shares", [])
                if token not in shares:
                    shares.append(token)
                    _save(users)
                return


def remove_received_share(user_id: str, token: str) -> None:
    with _lock:
        users = _load()
        for u in users.values():
            if u["id"] == user_id and token in u.get("received_shares", []):
                u["received_shares"].remove(token)
                _save(users)
                return


def list_received_shares(user_id: str) -> list[str]:
    u = get_by_id(user_id)
    return u.get("received_shares", []) if u else []


def update_password(user_id: str, new_password: str) -> bool:
    with _lock:
        users = _load()
        for u in users.values():
            if u["id"] == user_id:
                u["password_hash"] = hash_password(new_password)
                _save(users)
                return True
    return False


def _public(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "role": u["role"], "created_at": u.get("created_at")}


def public(u: dict) -> dict:
    return _public(u)


# ---------- Amorçage admin ----------
def ensure_admin() -> dict:
    """Crée le compte admin s'il n'existe pas (avec le hash fourni)."""
    existing = get_by_email(ADMIN_EMAIL)
    if existing:
        if existing.get("role") != "admin":
            set_role(existing["id"], "admin")
        return existing
    with _lock:
        users = _load()
        user = {
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower().strip(),
            "password_hash": ADMIN_HASH,
            "role": "admin",
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        users[user["email"]] = user
        _save(users)
    return user


# ---------- Dépendances FastAPI ----------
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    payload = _decode(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide ou expiré")
    user = get_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Compte introuvable")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Réservé à l'administrateur")
    return user


def user_from_token_value(token: str | None) -> dict | None:
    """Décodage manuel (pour les routes fichiers qui acceptent ?token=)."""
    if not token:
        return None
    payload = _decode(token)
    if not payload:
        return None
    return get_by_id(payload["sub"])
