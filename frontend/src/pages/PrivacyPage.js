import { useState, useEffect } from "react";
import api, { API_BASE } from "../api";

export default function PrivacyPage() {
  const [status, setStatus] = useState(null);
  const [cloud, setCloud] = useState(null);

  useEffect(() => {
    api.get("/health").then(({ data }) => setCloud(data)).catch(() => {});
  }, []);

  const sendDeleteRequest = async () => {
    const email = prompt("Entrez votre adresse email :");
    if (!email) return;
    try {
      const form = new FormData();
      form.append("email", email);
      const res = await fetch(`${API_BASE}/gdpr/delete_request`, { method: "POST", body: form });
      const data = await res.json();
      setStatus(data.message || "Demande enregistrée.");
    } catch (err) {
      setStatus("Erreur lors de l’envoi de la demande.");
    }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg)", color: "var(--text)", padding: "40px 20px" }}>
      <h1 style={{ margin: "0 auto 24px", color: "var(--title)", maxWidth: 800 }}>Politique de confidentialité</h1>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "var(--shadow)", maxWidth: 800, margin: "0 auto" }}>

        <h2 style={sub}>Vos fichiers sont privés</h2>
        <p>
          Chaque compte dispose de sa <strong>propre bibliothèque</strong>. Vos documents PDF ne sont
          accessibles qu'à <strong>vous</strong>, une fois connecté. Aucun autre utilisateur ne peut les voir,
          et les fichiers sont servis derrière une authentification.
        </p>

        <h2 style={sub}>Traitement par l'intelligence artificielle</h2>
        {cloud?.is_cloud ? (
          <p>
            ⚠️ Cette instance utilise un moteur d'IA <strong>externe ({cloud.provider})</strong>. Lorsque vous posez
            une question, des <strong>extraits du document concerné sont envoyés à ce service tiers</strong> afin de
            générer la réponse. N'interrogez pas l'IA sur des informations strictement confidentielles.
          </p>
        ) : (
          <p>
            Cette instance traite vos documents <strong>localement</strong> (modèle d'IA hébergé sur le serveur).
            Les fichiers et leurs extraits ne sont <strong>pas envoyés à des tiers</strong>.
          </p>
        )}

        <h2 style={sub}>Partage de documents</h2>
        <p>
          Vous pouvez générer un <strong>lien de partage</strong> pour un document. Toute personne disposant de ce lien
          peut <strong>lire</strong> le document, même sans compte. Poser des questions à l'IA reste réservé aux
          utilisateurs connectés. Vous pouvez <strong>révoquer</strong> un lien à tout moment : il devient alors
          immédiatement inaccessible.
        </p>

        <h2 style={sub}>Vos droits</h2>
        <ul style={{ lineHeight: 1.8 }}>
          <li>
            <strong>Droit à l'effacement :</strong> vous pouvez supprimer vos documents à tout moment depuis votre
            bibliothèque, ou demander la suppression de l'ensemble de vos données ci-dessous.
            <div style={{ marginTop: 8 }}>
              <button onClick={sendDeleteRequest} style={{ padding: "10px 16px", background: "var(--danger)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                Demander l'effacement de mes données
              </button>
            </div>
          </li>
          <li><strong>Droit à l'information :</strong> accès clair aux traitements réalisés (cette page).</li>
          <li><strong>Droit à la portabilité :</strong> vos documents originaux restent téléchargeables.</li>
        </ul>

        {status && <div style={{ marginTop: 16, fontWeight: 600, color: "var(--success)" }}>✅ {status}</div>}
      </div>

      <footer style={{ textAlign: "center", padding: "24px 16px", color: "var(--muted)", fontSize: 14 }}>
        © {new Date().getFullYear()} BiblioTalk — Respect de votre vie privée
      </footer>
    </div>
  );
}

const sub = { marginTop: 28, marginBottom: 10, color: "var(--accent)", fontSize: 18 };
