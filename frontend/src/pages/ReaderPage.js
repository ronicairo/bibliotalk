import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import api, { mediaUrl } from "../api";
import useIsMobile from "../hooks/useIsMobile";
import PdfPage from "../components/PdfPage";
import * as pdfjsLib from "pdfjs-dist";

// Worker pdf.js depuis le CDN (version exacte) — robuste en prod, évite le bug "require is not defined"
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function ReaderPage() {
  const { docId } = useParams();
  const isMobile = useIsMobile();

  const scrollRef = useRef(null);
  const chatEndRef = useRef(null);

  // State PDF
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1); // multiplicateur de zoom
  const [vw, setVw] = useState(0);     // largeur dispo de la zone PDF
  const [docTitle, setDocTitle] = useState("");
  const [pdfError, setPdfError] = useState(null);

  // State Chat
  const [chatOpen, setChatOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cloud, setCloud] = useState(null);

  useEffect(() => {
    api.get("/health").then(({ data }) => setCloud(data)).catch(() => {});
  }, []);

  // Charger le doc + PDF
  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/doc/${docId}`);
      setDocTitle(data?.metadata?.title || data?.file_name || "Document");
      if (data?.file_url) {
        const task = pdfjsLib.getDocument(mediaUrl(data.file_url));
        task.promise
          .then((loaded) => { setPdf(loaded); setNumPages(loaded.numPages); setPdfError(null); })
          .catch((err) => { console.error("Chargement PDF échoué:", err); setPdfError(err?.message || "Impossible de charger le PDF."); });
      }
    })();
  }, [docId]);

  // Mesure la largeur de la zone PDF (et la met à jour si la fenêtre/le panneau change)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setVw(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chatOpen, isMobile]);

  // Largeur de rendu : à zoom 1, tient exactement dans la zone (jamais plus large) ; plafonnée à 950 sur grand écran
  const pageWidth = vw ? Math.min(vw - 24, 950) * zoom : 0;

  // Indicateur de page courante au scroll
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

  const goToPage = (p) => {
    scrollRef.current?.querySelector(`[data-page="${p}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const askQuestion = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion(""); setLoading(true);
    try {
      const { data } = await api.post(`/ask`, { doc_id: docId, question: q });
      setMessages((m) => [...m, { role: "assistant", text: data.answer, matches: data.matches }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Le service de réponse est momentanément indisponible, réessaie dans un instant.", matches: [] }]);
    } finally { setLoading(false); }
  };

  const suggestions = ["Résume ce document", "Quels sont les points clés ?", "Quelles sont les dates importantes ?"];

  // Disposition : colonnes (desktop) ou lignes (mobile) ; le chat se replie
  const outerStyle = isMobile
    ? { gridTemplateRows: chatOpen ? "1fr 45vh" : "1fr" }
    : { gridTemplateColumns: chatOpen ? "1fr 420px" : "1fr" };

  return (
    <div style={{ display: "grid", ...outerStyle, height: "100%", background: "var(--bg)", color: "var(--text)" }}>
      {/* ===== Colonne PDF ===== */}
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, minHeight: 0, borderRight: !isMobile && chatOpen ? "1px solid var(--border)" : "none" }}>
        {/* Barre d'outils (compacte + repliable sur petit écran) */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: isMobile ? "8px 10px" : "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <div style={{ flex: "1 1 120px", minWidth: 0, fontWeight: 700, color: "var(--title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: isMobile ? 15 : 16 }}>{docTitle}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ opacity: 0.8, fontSize: 13, whiteSpace: "nowrap" }}>{currentPage} / {numPages || "…"}</span>
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} style={miniBtn}>➖</button>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.15))} style={miniBtn}>➕</button>
            <button onClick={() => setChatOpen((o) => !o)} title={chatOpen ? "Masquer le chat" : "Afficher le chat"} style={{ ...miniBtn, background: chatOpen ? "var(--primary)" : "var(--bg)", color: chatOpen ? "#fff" : "var(--text)" }}>💬</button>
          </div>
        </div>
        {/* Zone PDF scrollable (toutes les pages) — overflow auto pour défiler horizontalement si zoom */}
        <div ref={scrollRef} onScroll={onScroll} style={{ overflow: "auto", minHeight: 0, padding: 12, background: "var(--bg)" }}>
          {pdfError ? (
            <div style={{ maxWidth: 420, margin: "40px auto", padding: 20, textAlign: "center", background: "var(--card)", border: "1px solid var(--danger)", borderRadius: 12 }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Le PDF n'a pas pu se charger</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{pdfError}</div>
            </div>
          ) : (
            pdf && Array.from({ length: numPages }, (_, i) => (
              <PdfPage key={i} pdf={pdf} pageNumber={i + 1} width={pageWidth} />
            ))
          )}
        </div>
      </div>

      {/* ===== Panneau Chat (repliable) ===== */}
      {chatOpen && (
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--card)", minWidth: 0, minHeight: 0, borderTop: isMobile ? "1px solid var(--border)" : "none" }}>
          <div>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <div style={{ fontWeight: 700, flex: 1 }}>Discuter avec ce document</div>
              <button onClick={() => setChatOpen(false)} title="Fermer" style={{ ...iconBtn, fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            {cloud?.is_cloud && (
              <div style={{ margin: "8px 16px 0", padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 12.5 }}>
                ⚠️ Pour générer les réponses, des extraits sont envoyés à un service tiers ({cloud.provider}).
              </div>
            )}
          </div>

          <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.length === 0 && !loading && (
              <div style={{ opacity: 0.7, fontSize: 14 }}>
                <p style={{ marginTop: 0 }}>Pose une question sur le contenu de ce PDF :</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {suggestions.map((s) => <button key={s} onClick={() => setQuestion(s)} style={chip}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "92%", padding: "10px 14px", borderRadius: 14, whiteSpace: "pre-wrap", lineHeight: 1.5,
                  background: m.role === "user" ? "var(--primary)" : "var(--bg)", color: m.role === "user" ? "#fff" : "var(--text)",
                  border: m.role === "user" ? "none" : "1px solid var(--border)" }}>
                  <div>{m.text}</div>
                  {m.role === "assistant" && m.matches?.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[...new Set(m.matches.map((x) => x.page))].filter(Boolean).map((p) => (
                        <button key={p} onClick={() => goToPage(p)} title={`Aller à la page ${p}`} style={sourceTag}>page {p}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div style={{ fontSize: 14, opacity: 0.8 }}><span className="bt-dots">Le document réfléchit…</span></div>}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
              placeholder="Pose ta question…" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askQuestion()} disabled={loading} />
            <button onClick={askQuestion} disabled={loading || !question.trim()} style={{ padding: "12px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "…" : "Envoyer"}
            </button>
          </div>
        </div>
      )}

      {/* Bouton flottant pour rouvrir le chat quand il est fermé */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} title="Ouvrir le chat"
          style={{ position: "fixed", bottom: 20, right: 20, zIndex: 20, width: 56, height: 56, borderRadius: "50%", background: "var(--primary)", color: "#fff", border: "none", fontSize: 24, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.3)" }}>
          💬
        </button>
      )}
    </div>
  );
}

const iconBtn = { padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" };
const miniBtn = { padding: "5px 9px", fontSize: 14, lineHeight: 1, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" };
const chip = { textAlign: "left", padding: "8px 12px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer" };
const sourceTag = { padding: "3px 8px", fontSize: 12, background: "var(--card)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 20, cursor: "pointer" };
