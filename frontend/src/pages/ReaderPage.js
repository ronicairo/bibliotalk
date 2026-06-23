import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import api, { mediaUrl } from "../api";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.js",
  import.meta.url
).toString();

export default function ReaderPage() {
  const { docId } = useParams();

  // Refs PDF
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const renderTaskRef = useRef(null);
  const chatEndRef = useRef(null);

  // State PDF
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [docTitle, setDocTitle] = useState("");

  // State Chat
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]); // {role, text, matches?}
  const [loading, setLoading] = useState(false);
  const [cloud, setCloud] = useState(null); // {is_cloud, provider}

  // Savoir si le moteur est local (privé) ou cloud (tiers) -> avertissement
  useEffect(() => {
    api.get("/health").then(({ data }) => setCloud(data)).catch(() => {});
  }, []);

  // 1) Charger le doc + PDF.js
  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/doc/${docId}`);
      setDocTitle(data?.metadata?.title || data?.file_name || "Document");
      if (data?.file_url) {
        const task = pdfjsLib.getDocument(mediaUrl(data.file_url));
        task.promise.then((loaded) => {
          setPdf(loaded);
          setNumPages(loaded.numPages);
          setPageNum(1);
        });
      }
    })();
  }, [docId]);

  // 2) Rendu HiDPI + fit-to-width
  const renderPage = async (num, loadedPdf = pdf) => {
    if (!loadedPdf) return;
    const page = await loadedPdf.getPage(num);
    const baseViewport = page.getViewport({ scale: 1 });

    let effectiveScale = scale;
    if (fitToWidth && scrollRef.current) {
      // Ajuste pour que la PAGE ENTIÈRE tienne dans la zone visible (ni trop grande, ni scroll)
      const availW = Math.max(320, (scrollRef.current.clientWidth || 800) - 32);
      const availH = Math.max(320, (scrollRef.current.clientHeight || 600) - 32);
      effectiveScale = Math.min(availW / baseViewport.width, availH / baseViewport.height);
    }
    const viewport = page.getViewport({ scale: effectiveScale });

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_) {}
    }
    const task = page.render({
      canvasContext: context,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    renderTaskRef.current = task;
    task.promise.catch((err) => {
      if (err?.name !== "RenderingCancelledException") console.error("PDF.js:", err);
    });
  };

  useEffect(() => {
    if (!pdf) return;
    renderPage(pageNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, scale, fitToWidth]);

  useEffect(() => {
    if (!pdf || !fitToWidth) return;
    const onResize = () => renderPage(pageNum);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, fitToWidth]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Navigation
  const prevPage = () => setPageNum((p) => Math.max(1, p - 1));
  const nextPage = () => setPageNum((p) => Math.min(numPages, p + 1));
  const zoomIn = () => { setFitToWidth(false); setScale((s) => s + 0.2); };
  const zoomOut = () => { setFitToWidth(false); setScale((s) => Math.max(0.5, s - 0.2)); };
  const goToPage = (p) => { if (p >= 1 && p <= numPages) { setFitToWidth(true); setPageNum(p); } };

  // Q/A
  const askQuestion = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const { data } = await api.post(`/ask`, { doc_id: docId, question: q });
      setMessages((m) => [...m, { role: "assistant", text: data.answer, matches: data.matches }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Erreur : le modèle local n'a pas répondu. Vérifie qu'Ollama est lancé.", matches: [] }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "Résume ce document",
    "Quels sont les points clés ?",
    "Quelles sont les dates importantes ?",
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", height: "100%", background: "var(--bg)", color: "var(--text)" }}>
      {/* ===== Colonne PDF ===== */}
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, borderRight: "1px solid var(--border)" }}>
        {/* Barre d'outils PDF */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
          <div style={{ fontWeight: 700, color: "var(--title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{docTitle}</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={prevPage} disabled={pageNum <= 1} style={iconBtn}>◀</button>
            <span style={{ opacity: 0.8, fontSize: 14, minWidth: 70, textAlign: "center" }}>{pageNum} / {numPages || "…"}</span>
            <button onClick={nextPage} disabled={pageNum >= numPages} style={iconBtn}>▶</button>
            <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
            <button onClick={zoomOut} style={iconBtn}>➖</button>
            <button onClick={zoomIn} style={iconBtn}>➕</button>
          </div>
        </div>
        {/* Zone PDF */}
        <div ref={scrollRef} style={{ overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start", background: "var(--bg)" }}>
          <canvas ref={canvasRef} style={{ display: "block", borderRadius: 8, boxShadow: "var(--shadow)" }} />
        </div>
      </div>

      {/* ===== Panneau Chat ===== */}
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--card)", minWidth: 0 }}>
        {/* En-tête + avertissement (1ère rangée de la grille) */}
        <div>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <div>
            <div style={{ fontWeight: 700 }}>Discuter avec ce document</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
      
            </div>
          </div>
        </div>

        {/* Avertissement confidentialité (uniquement en mode cloud) */}
        {cloud?.is_cloud && (
          <div style={{ margin: "8px 16px 0", padding: "8px 12px", background: "rgba(245,158,11,0.12)", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 12.5, color: "var(--text)" }}>
            ⚠️ Pour générer les réponses, des extraits de ce document sont envoyés à un service tiers ({cloud.provider}). Ne pose pas de questions sur des données strictement confidentielles.
          </div>
        )}
        </div>

        {/* Historique */}
        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 && !loading && (
            <div style={{ opacity: 0.7, fontSize: 14 }}>
              <p style={{ marginTop: 0 }}>Pose une question sur le contenu de ce PDF. Par exemple :</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => { setQuestion(s); }} style={chip}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "92%", padding: "10px 14px", borderRadius: 14, whiteSpace: "pre-wrap", lineHeight: 1.5,
                background: m.role === "user" ? "var(--primary)" : "var(--bg)",
                color: m.role === "user" ? "#fff" : "var(--text)",
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

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", borderRadius: 14, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 14, opacity: 0.8 }}>
                <span className="bt-dots">Le document réfléchit…</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Saisie */}
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
            placeholder="Pose ta question…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askQuestion()}
            disabled={loading}
          />
          <button onClick={askQuestion} disabled={loading || !question.trim()}
            style={{ padding: "12px 18px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn = { padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" };
const chip = { textAlign: "left", padding: "8px 12px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer" };
const sourceTag = { padding: "3px 8px", fontSize: 12, background: "var(--card)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 20, cursor: "pointer" };
