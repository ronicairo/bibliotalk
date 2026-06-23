
import { useEffect, useState, memo } from "react";
import axios from "axios";
import { ThemeToggle } from "../theme/ThemeProvider.jsx";

const API_URL = "http://localhost:8000";

/* ---------- UI Components ---------- */
const Card = memo(({ title, children, actions, style }) => (
  <div
    style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 20,
      boxShadow: "var(--shadow)",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
      <h3 style={{ margin: 0, color: "var(--accent)" }}>{title}</h3>
      {actions && <div style={{ marginLeft: "auto" }}>{actions}</div>}
    </div>
    {children}
  </div>
));

const Input = memo((props) => (
  <input
    {...props}
    autoComplete="off"
    spellCheck={false}
    style={{
      ...props.style,
      width: "100%",
      padding: "10px 12px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--card)",
      color: "var(--text)",
      outline: "none",
      boxSizing: "border-box",
    }}
  />
));

const Textarea = memo((props) => (
  <textarea
    {...props}
    spellCheck={false}
    style={{
      ...props.style,
      width: "100%",
      padding: "10px 12px",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--card)",
      color: "var(--text)",
      outline: "none",
      minHeight: 140,
      resize: "vertical",
      boxSizing: "border-box",
      whiteSpace: "pre-wrap",
      overflow: "auto",
    }}
  />
));

const Button = memo(({ children, variant = "primary", ...rest }) => {
  const colors = {
    primary: "var(--primary)",
    success: "var(--success)",
    neutral: "var(--muted)",
    danger: "var(--danger)",
  };
  return (
    <button
      {...rest}
      style={{
        padding: "10px 14px",
        background: colors[variant] || "var(--primary)",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        opacity: rest.disabled ? 0.6 : 1,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
});

/* ---------- Page ---------- */
export default function AdminPage() {
  const [file, setFile] = useState(null);
  const [lastUpload, setLastUpload] = useState(null);

  const [question, setQuestion] = useState("");
  const [chunk, setChunk] = useState("");
  const [label, setLabel] = useState(1);

  const [isTraining, setIsTraining] = useState(false);
  const [trainOutput, setTrainOutput] = useState("");
  const [trainReport, setTrainReport] = useState(null);

  const [, setDocs] = useState([]);

  const [token, setToken] = useState(localStorage.getItem("ADMIN_TOKEN") || "");
  const [isLogged, setIsLogged] = useState(false);
  const authHeaders = isLogged && token ? { "X-Token": token } : {};

  // Responsive breakpoints via JS (pour inline styles)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (token) localStorage.setItem("ADMIN_TOKEN", token);
    else localStorage.removeItem("ADMIN_TOKEN");
  }, [token]);

  const handleLogin = async () => {
    try {
      await axios.post(`${API_URL}/admin/login`, new URLSearchParams({ x_token: token }));
      setIsLogged(true);
    } catch {
      setIsLogged(false);
      alert("Token incorrect");
    }
  };

  const uploadPdf = async () => {
    if (!file) return alert("Choisis un PDF");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await axios.post(`${API_URL}/upload`, form);
      setLastUpload({ doc_id: data.doc_id, file_name: data.file_name });
      setDocs((prev) => [...prev, data]);
      setFile(null);
    } catch (err) {
      console.error(err);
      alert("❌ Erreur upload PDF");
    }
  };

  const saveQA = async () => {
    if (!question.trim() || !chunk.trim()) return alert("Remplis les champs");
    try {
      const form = new FormData();
      form.append("question", question);
      form.append("chunk", chunk);
      form.append("label", String(label));
      await axios.post(`${API_URL}/admin/add_example`, form, { headers: authHeaders });
      alert("✅ Exemple ajouté");
      setQuestion("");
      setChunk("");
      setLabel(1);
    } catch (e) {
      console.error(e);
      alert("Erreur ajout exemple");
    }
  };

  const retrain = async () => {
    setIsTraining(true);
    setTrainOutput("");
    setTrainReport(null);
    try {
      const { data } = await axios.post(`${API_URL}/admin/retrain`, null, { headers: authHeaders });
      console.log("RETRAIN RAW:", data);
      if (data.report) setTrainReport(data.report);
      else setTrainOutput(data.stdout || data.output || "");
    } catch (e) {
      console.error(e);
      alert("Erreur entraînement");
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div style={{ padding: 20, background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: "var(--title, var(--text))" }}>
          Entraînement IA
        </h1>
        <div style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </div>
      </div>

      {/* Connexion */}
      {!isLogged ? (
        <Card
          title="Connexion requise"
          actions={<Button onClick={handleLogin}>Se connecter</Button>}
        >
          <p style={{ opacity: 0.9 }}>
            Entre ton <code>ADMIN_TOKEN</code> pour accéder aux outils d’administration.
          </p>
          <Input
            placeholder="ADMIN_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Card>
      ) : (
        <>
          {/* Grille principale : gauche (deux cartes empilées), droite (formulaire QA) */}
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: isNarrow ? "1fr" : "1.05fr 1.35fr",
              alignItems: "start",
            }}
          >
            {/* Colonne gauche : Upload au-dessus, Réentraîner en dessous */}
            <div style={{ display: "grid", gap: 20 }}>
              {/* Upload PDF */}
              <Card title="Uploader un PDF">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "flex-start",
                  }}
                >
                  <input type="file" onChange={(e) => setFile(e.target.files[0])} />
                  <Button onClick={uploadPdf}>Importer</Button>
                  {lastUpload?.doc_id && (
                    <Button
                      variant="neutral"
                      onClick={() => window.open(`/reader/${lastUpload.doc_id}`, "_blank")}
                    >
                      Ouvrir le lecteur
                    </Button>
                  )}
                </div>
              </Card>

              <Card
  title="Réentraîner le modèle"
  actions={
    <Button onClick={retrain} disabled={isTraining}>
      {isTraining ? "Entraînement..." : "Lancer"}
    </Button>
  }
>
{trainReport?.trained_at && <div>⏱️ {trainReport.trained_at}</div>}
{trainReport?.dataset_path && <div style={{opacity:0.8}}>📁 {trainReport.dataset_path}</div>}

  {trainReport ? (
    <div style={{ display: "grid", gap: 12 }}>
      {trainReport.dataset_rows != null && (
        <div>📊 {trainReport.dataset_rows} lignes dans le dataset</div>
      )}
      {trainReport.model_path && <div>💾 Modèle : {trainReport.model_path}</div>}

      {/* Tableau mono-modèle */}
      {trainReport.metrics && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 520 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={{ border: "1px solid var(--border)", padding: 6, textAlign: "left" }}>Classe / Global</th>
                <th style={{ border: "1px solid var(--border)", padding: 6 }}>Precision</th>
                <th style={{ border: "1px solid var(--border)", padding: 6 }}>Recall</th>
                <th style={{ border: "1px solid var(--border)", padding: 6 }}>F1</th>
                <th style={{ border: "1px solid var(--border)", padding: 6 }}>Support</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(trainReport.metrics).map(([k, v]) => {
                if (k === "accuracy") {
                  return (
                    <tr key={k}>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>accuracy</td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }} colSpan={3}>
                        {typeof v === "number" ? (v*100).toFixed(1) + "%" : "-"}
                      </td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }} />
                    </tr>
                  );
                }
                if (typeof v === "object") {
                  return (
                    <tr key={k}>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>{k}</td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>
                        {typeof v.precision === "number" ? (v.precision*100).toFixed(1) + "%" : "-"}
                      </td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>
                        {typeof v.recall === "number" ? (v.recall*100).toFixed(1) + "%" : "-"}
                      </td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>
                        {typeof v["f1-score"] === "number" ? v["f1-score"].toFixed(2) : "-"}
                      </td>
                      <td style={{ border: "1px solid var(--border)", padding: 6 }}>
                        {typeof v.support === "number" ? v.support : "-"}
                      </td>
                    </tr>
                  );
                }
                return null;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  ) : (
    isTraining ? <div>Entraînement en cours…</div> : <div>Aucun rapport encore disponible.</div>
  )}
</Card>
            </div>

            {/* Colonne droite : Ajouter un exemple supervisé */}
            <Card title="Ajouter un exemple supervisé">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  maxWidth: 720,
                  margin: "0 auto",
                }}
              >
                <Input
                  placeholder="Question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
                <Textarea
                  placeholder="Extrait (chunk)"
                  value={chunk}
                  onChange={(e) => setChunk(e.target.value)}
                />
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 4,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <label>
                    <input type="radio" checked={label === 1} onChange={() => setLabel(1)} /> Positif
                  </label>
                  <label>
                    <input type="radio" checked={label === 0} onChange={() => setLabel(0)} /> Négatif
                  </label>
                  <div style={{ marginLeft: "auto" }}>
                    <Button variant="success" onClick={saveQA}>Ajouter</Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
