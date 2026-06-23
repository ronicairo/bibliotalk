import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeProvider";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [shares, setShares] = useState([]);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdMsg, setPwdMsg] = useState(null);

  const loadShares = () => api.get("/list_docs").then(({ data }) => setShares(data.filter((d) => d.shared))).catch(() => {});
  useEffect(() => { loadShares(); }, []);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwdMsg(null);
    if (pwd.next.length < 6) return setPwdMsg({ err: true, text: "Le nouveau mot de passe doit faire au moins 6 caractères." });
    if (pwd.next !== pwd.confirm) return setPwdMsg({ err: true, text: "Les mots de passe ne correspondent pas." });
    try {
      await api.post("/auth/change_password", { current_password: pwd.current, new_password: pwd.next });
      setPwdMsg({ err: false, text: "Mot de passe modifié ✓" });
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwdMsg({ err: true, text: err?.response?.data?.detail || "Erreur" });
    }
  };

  const revoke = async (doc) => {
    try { await api.delete(`/doc/${doc.doc_id}/share`); setShares((p) => p.filter((d) => d.doc_id !== doc.doc_id)); }
    catch { alert("Erreur lors de la révocation"); }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Supprimer définitivement ton compte et TOUS tes documents ? Cette action est irréversible.")) return;
    if (!window.confirm("Dernière confirmation : tout sera effacé. Continuer ?")) return;
    try { await api.delete("/auth/me"); logout(); navigate("/"); }
    catch { alert("Erreur lors de la suppression du compte"); }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px 60px" }}>
        <h1 style={{ color: "var(--title)", marginTop: 0 }}>Paramètres</h1>

        {/* Apparence */}
        <Section title="Apparence">
          <Row label="Thème">
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => theme !== "light" && toggleTheme()} style={seg(theme === "light")}>Clair</button>
              <button onClick={() => theme !== "dark" && toggleTheme()} style={seg(theme === "dark")}>Sombre</button>
            </div>
          </Row>
        </Section>

        {/* Compte */}
        <Section title="Compte">
          <Row label="Email"><span style={{ opacity: 0.8 }}>{user?.email}</span></Row>
          <form onSubmit={changePassword} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Changer le mot de passe</div>
            <input type="password" placeholder="Mot de passe actuel" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required style={inp} />
            <input type="password" placeholder="Nouveau mot de passe" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required style={inp} />
            <input type="password" placeholder="Confirmer le nouveau mot de passe" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required style={inp} />
            {pwdMsg && <div style={{ fontSize: 14, marginTop: 4, color: pwdMsg.err ? "var(--danger)" : "var(--success)" }}>{pwdMsg.text}</div>}
            <button type="submit" style={{ ...solidBtn, marginTop: 12 }}>Mettre à jour</button>
          </form>
        </Section>

        {/* Partages actifs */}
        <Section title="Mes liens de partage">
          {shares.length === 0 ? (
            <p style={{ opacity: 0.6, margin: 0 }}>Aucun document partagé pour l'instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shares.map((d) => (
                <div key={d.doc_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.metadata?.title || d.file_name}</span>
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${d.share_token}`)} style={ghostBtn}>Copier le lien</button>
                  <button onClick={() => revoke(d)} style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}>Révoquer</button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Zone dangereuse */}
        <Section title="Zone dangereuse" danger>
          <Row label="Supprimer mon compte">
            <button onClick={deleteAccount} style={{ ...solidBtn, background: "var(--danger)" }}>Supprimer définitivement</button>
          </Row>
          <p style={{ fontSize: 13, opacity: 0.6, margin: "8px 0 0" }}>Supprime ton compte et tous tes documents. Irréversible.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, danger }) {
  return (
    <div style={{ background: "var(--card)", border: `1px solid ${danger ? "var(--danger)" : "var(--border)"}`, borderRadius: 14, padding: 20, marginTop: 20, boxShadow: "var(--shadow)" }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 17, color: danger ? "var(--danger)" : "var(--title)" }}>{title}</h2>
      {children}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

const seg = (active) => ({ padding: "8px 18px", background: active ? "var(--primary)" : "var(--card)", color: active ? "#fff" : "var(--text)", border: "none", cursor: "pointer", fontWeight: 600 });
const inp = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box", marginBottom: 10 };
const solidBtn = { padding: "10px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600 };
const ghostBtn = { padding: "8px 14px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" };
