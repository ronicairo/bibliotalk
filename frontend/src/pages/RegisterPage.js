import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { wrap, card, lbl, inp, btn, errBox } from "./LoginPage";

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/library" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Le mot de passe doit faire au moins 6 caractères.");
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");
    setLoading(true);
    try {
      await register(email, password);
      navigate("/library");
    } catch (err) {
      setError(err?.response?.data?.detail || "Inscription impossible");
    } finally { setLoading(false); }
  };

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={card}>
        <img src="/logo1.png" alt="BiblioTalk" style={{ height: 64, width: 64, borderRadius: 14, display: "block", margin: "0 auto 14px" }} />
        <h1 style={{ margin: "0 0 4px", color: "var(--title)" }}>Créer un compte</h1>
        <p style={{ margin: "0 0 20px", opacity: 0.65, fontSize: 14 }}>Ta bibliothèque, privée et locale</p>
        {error && <div style={errBox}>{error}</div>}
        <label style={lbl}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inp} placeholder="toi@exemple.fr" />
        <label style={lbl}>Mot de passe</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inp} placeholder="6 caractères minimum" />
        <label style={lbl}>Confirmer le mot de passe</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inp} placeholder="••••••••" />
        <button type="submit" disabled={loading} style={btn}>{loading ? "Création…" : "S'inscrire"}</button>
        <p style={{ textAlign: "center", marginTop: 18, fontSize: 14 }}>
          Déjà inscrit ? <Link to="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Se connecter</Link>
        </p>
      </form>
    </div>
  );
}
