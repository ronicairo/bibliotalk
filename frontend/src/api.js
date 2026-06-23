import axios from "axios";

// URL du backend : configurable au build via REACT_APP_API_URL (sinon localhost en dev)
export const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Instance axios qui ajoute automatiquement le token JWT
const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bt_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Déconnexion automatique si le token est rejeté
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("bt_token");
      localStorage.removeItem("bt_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// URL d'un média (PDF / miniature) avec le token en query (pour <img> et pdf.js)
export function mediaUrl(path) {
  const token = localStorage.getItem("bt_token") || "";
  return `${API_BASE}${path}?token=${encodeURIComponent(token)}`;
}

export default api;
