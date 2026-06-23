import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import api, { API_BASE } from "../api";
import { useAuth } from "../auth/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import PdfPage from "../components/PdfPage";

// Worker pdf.js depuis le CDN (version exacte) — robuste en prod, évite le bug "require is not defined"
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function SharePage() {
  const { token } = useParams();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const scrollRef = useRef(null);
  const chatEndRef = useRef(null);

  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [vw, setVw] = useState(0);
  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cloud, setCloud] = useState(null);

  useEffect(() => {
    api.get("/health").then(({ data }) => setCloud(data)).catch(() => {});
  }, []);

  // Si connecté, mémoriser ce partage dans "Partagés avec moi"
  useEffect(() => {
    if (user) api.post(`/share/${token}/save`).catch(() => {});
  }, [user, token]);

  // Charger le document partagé (public)
  useEffect(() => {
    fetch(`${API_BASE}/share/${token}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((data) => {
        setTitle(data.title || data.file_name || "Document partagé");
        const task = pdfjsLib.getDocument(`${API_BASE}/share/${token}/file`);
        task.promise.then((loaded) => { setPdf(loaded); setNumPages(loaded.numPages); }).catch(() => setNotFound(true));
      })
      .catch(() => setNotFound(true));
  }, [token]);

  // Mesure la largeur de la zone PDF
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setVw(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  const pageWidth = vw ? Math.max(280, Math.min(vw - 24, 950)) * zoom : 0;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let cur = 1;
    el.querySelectorAll("[data-page]").forEach((p) => {
      if (p.getBoundingClientRect().top - top < el.clientHeight * 0.4) cur = Number(p.dataset.page);
    });
    setCurrentPage(cur);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const askQuestion = async () => {
    const q = question.trim();
    if (!q || loading || !user) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion(""); setLoading(true);
    try {
      const { data } = await api.post(`/share/${token}/ask`, { question: q });
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Une erreur est survenue." }]);
    } finally { setLoading(false); }
  };

  if (notFound) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--text)", gap: 12 }}>
        <img src="/logo1.png" alt="" style={{ width: 64, height: 64, borderRadius: 14 }} />
        <h2>Lien indisponible</h2>
        <p style={{ opacity: 0.7 }}>Ce lien de partage est invalide ou a été révoqué.</p>
        <Link to="/" style={{ color: "var(--primary)", fontWeight: 600 }}>Aller à BiblioTalk</Link>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      {/* En-tête */}
      <div style={{ flexShrink: 0, height: 56, padding: "0 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--card)" }}>
        <img src="/logo1.png" alt="" style={{ height: 32, width: 32, borderRadius: 8 }} />
        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6, border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 20 }}>Document partagé · lecture</span>
        <div style={{ marginLeft: "auto" }}>
          {!user && <Link to="/login" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 14 }}>Se connecter</Link>}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", ...(isMobile ? { gridTemplateRows: "1fr 45vh" } : { gridTemplateColumns: "1fr 400px" }) }}>
        {/* PDF */}
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, minHeight: 0, borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 8, borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{currentPage} / {numPages || "…"}</span>
            <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} style={navBtn}>➖</button>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))} style={navBtn}>➕</button>
          </div>
          <div ref={scrollRef} onScroll={onScroll} style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: 12 }}>
            {pdf && Array.from({ length: numPages }, (_, i) => (
              <PdfPage key={i} pdf={pdf} pageNumber={i + 1} width={pageWidth} />
            ))}
          </div>
        </div>

        {/* Chat (réservé aux connectés) */}
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--card)", minWidth: 0, minHeight: 0, borderTop: isMobile ? "1px solid var(--border)" : "none" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>💬 Questions</div>

          <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {!user ? (
              <div style={{ opacity: 0.8, fontSize: 14, textAlign: "center", marginTop: 20 }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
                <p>Pour poser des questions sur ce document, tu dois avoir un compte.</p>
                <Link to="/login" style={{ display: "inline-block", marginTop: 8, padding: "10px 18px", background: "var(--primary)", color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}>Se connecter / S'inscrire</Link>
              </div>
            ) : (
              <>
                {cloud?.is_cloud && (
                  <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 12.5 }}>
                    ⚠️ Des extraits de ce document sont envoyés à un service tiers ({cloud.provider}) pour générer la réponse.
                  </div>
                )}
                {messages.length === 0 && !loading && <p style={{ opacity: 0.6, fontSize: 14 }}>Pose une question sur le contenu de ce PDF.</p>}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "92%", padding: "10px 14px", borderRadius: 14, whiteSpace: "pre-wrap", lineHeight: 1.5,
                      background: m.role === "user" ? "var(--primary)" : "var(--bg)", color: m.role === "user" ? "#fff" : "var(--text)",
                      border: m.role === "user" ? "none" : "1px solid var(--border)" }}>{m.text}</div>
                  </div>
                ))}
                {loading && <div style={{ fontSize: 14, opacity: 0.7 }}><span className="bt-dots">Réflexion en cours</span></div>}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {user && (
            <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askQuestion()} disabled={loading}
                placeholder="Pose ta question…" style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
              <button onClick={askQuestion} disabled={loading || !question.trim()} style={{ padding: "12px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>{loading ? "…" : "Envoyer"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const navBtn = { padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" };
