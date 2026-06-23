import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/library" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
      navigate("/library");
    } catch (err) {
      setError(err?.response?.data?.detail || "Connexion impossible");
    } finally { setLoading(false); }
  };

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={card}>
        <img src="/logo1.png" alt="BiblioTalk" style={{ height: 64, width: 64, borderRadius: 14, display: "block", margin: "0 auto 14px" }} />
        <h1 style={{ margin: "0 0 4px", color: "var(--title)" }}>Connexion</h1>
        <p style={{ margin: "0 0 20px", opacity: 0.65, fontSize: 14 }}>Accède à ta bibliothèque privée</p>
        {error && <div style={errBox}>{error}</div>}
        <label style={lbl}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inp} placeholder="toi@exemple.fr" />
        <label style={lbl}>Mot de passe</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required style={inp} placeholder="••••••••" />
        <button type="submit" disabled={loading} style={btn}>{loading ? "Connexion…" : "Se connecter"}</button>
        <p style={{ textAlign: "center", marginTop: 18, fontSize: 14 }}>
          Pas encore de compte ? <Link to="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>Créer un compte</Link>
        </p>
      </form>
    </div>
  );
}

export const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 20 };
export const card = { width: "100%", maxWidth: 380, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, boxShadow: "var(--shadow)" };
export const lbl = { display: "block", fontSize: 13, fontWeight: 600, margin: "12px 0 6px", opacity: 0.8 };
export const inp = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" };
export const btn = { width: "100%", marginTop: 22, padding: "12px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer" };
export const errBox = { background: "rgba(212,25,25,0.12)", color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 12px", fontSize: 14, marginBottom: 12 };
