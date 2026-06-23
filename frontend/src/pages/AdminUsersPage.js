import { useState, useEffect } from "react";
import api from "../api";
import { useAuth } from "../auth/AuthContext";

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  const load = () => api.get("/admin/users").then(({ data }) => setUsers(data)).catch(() => setError("Chargement impossible"));
  useEffect(() => { load(); }, []);

  const changeRole = async (u, role) => {
    try { await api.patch(`/admin/users/${u.id}/role`, { role }); load(); }
    catch { alert("Changement de rôle impossible"); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Supprimer le compte ${u.email} ?`)) return;
    try { await api.delete(`/admin/users/${u.id}`); load(); }
    catch (e) { alert(e?.response?.data?.detail || "Suppression impossible"); }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 28 }}>
      <h1 style={{ color: "var(--title)", marginTop: 0 }}>Administration · Utilisateurs</h1>
      <p style={{ opacity: 0.65 }}>{users.length} compte{users.length > 1 ? "s" : ""}</p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflowX: "auto", boxShadow: "var(--shadow)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", opacity: 0.7, fontSize: 13 }}>
              <th style={th}>Email</th><th style={th}>Rôle</th><th style={th}>Inscrit le</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={td}>{u.email}{u.id === me?.id && <span style={meTag}>moi</span>}</td>
                <td style={td}>
                  <span style={{ ...roleBadge, background: u.role === "admin" ? "var(--primary)" : "var(--accent)" }}>{u.role}</span>
                </td>
                <td style={{ ...td, opacity: 0.7, fontSize: 13 }}>{(u.created_at || "").replace("T", " ")}</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  {u.role === "admin"
                    ? <button onClick={() => changeRole(u, "user")} disabled={u.id === me?.id} style={sBtn}>Rétrograder</button>
                    : <button onClick={() => changeRole(u, "admin")} style={sBtn}>Promouvoir admin</button>}
                  <button onClick={() => remove(u)} disabled={u.id === me?.id} style={{ ...sBtn, background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" }}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "12px 16px" };
const td = { padding: "12px 16px" };
const roleBadge = { color: "#fff", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 };
const meTag = { marginLeft: 8, fontSize: 11, opacity: 0.6 };
const sBtn = { marginLeft: 8, padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13 };
