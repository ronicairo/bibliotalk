import { useState, useEffect, useRef } from "react";
import api, { mediaUrl } from "../api";

export default function LibraryPage() {
  const [tab, setTab] = useState("mine");
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [shared, setShared] = useState([]);
  const [trash, setTrash] = useState([]);

  const [view, setViewState] = useState(() => localStorage.getItem("bt_view") || "grid"); // grid | compact | list
  const setView = (v) => { setViewState(v); localStorage.setItem("bt_view", v); };
  const [currentFolder, setCurrentFolder] = useState(null); // id du dossier ouvert (null = racine)
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [folderMenuId, setFolderMenuId] = useState(null);
  const [shareBox, setShareBox] = useState(null);
  const [copied, setCopied] = useState(false);
  const [moveDoc, setMoveDoc] = useState(null);   // document en cours de déplacement
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileInputRef = useRef(null);

  const loadAll = () => {
    api.get(`/list_docs`).then(({ data }) => setDocs(data)).catch(console.error);
    api.get(`/folders`).then(({ data }) => setFolders(data)).catch(() => {});
    api.get(`/shared_with_me`).then(({ data }) => setShared(data)).catch(() => {});
    api.get(`/trash`).then(({ data }) => setTrash(data)).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (files.length === 0) return alert("Dépose un fichier PDF.");
    setUploading(true);
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        if (currentFolder) form.append("folder", currentFolder);
        const { data } = await api.post(`/upload`, form);
        setDocs((prev) => [...prev, data]);
      } catch (err) {
        console.error(err);
        alert(err?.response?.data?.detail || `Erreur lors de l'import de ${file.name}`);
        break; // inutile de continuer si la limite est atteinte
      }
    }
    setUploading(false);
  };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); };

  // Dossiers
  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return setNewFolder(false);
    try { const { data } = await api.post(`/folders`, { name }); setFolders((p) => [...p, data]); }
    catch { alert("Impossible de créer le dossier"); }
    setNewFolder(false); setFolderName("");
  };
  const renameFolder = async (f) => {
    const name = prompt("Renommer le dossier :", f.name);
    if (!name) return;
    try { await api.patch(`/folders/${f.id}`, { name }); setFolders((p) => p.map((x) => x.id === f.id ? { ...x, name } : x)); }
    catch { alert("Erreur"); }
  };
  const deleteFolder = async (f) => {
    if (!window.confirm(`Supprimer le dossier « ${f.name} » ? Les documents qu'il contient repasseront à la racine.`)) return;
    try { await api.delete(`/folders/${f.id}`); setFolders((p) => p.filter((x) => x.id !== f.id)); loadAll(); if (currentFolder === f.id) setCurrentFolder(null); }
    catch { alert("Erreur"); }
  };
  const moveTo = async (folderId) => {
    try {
      await api.patch(`/doc/${moveDoc.doc_id}/move`, { folder: folderId });
      setDocs((p) => p.map((d) => d.doc_id === moveDoc.doc_id ? { ...d, folder: folderId } : d));
    } catch { alert("Erreur lors du déplacement"); }
    setMoveDoc(null);
  };

  const confirmRename = async (doc) => {
    try {
      await api.patch(`/doc/${doc.doc_id}/rename`, { title: newTitle });
      setDocs((prev) => prev.map((d) => d.doc_id === doc.doc_id ? { ...d, metadata: { ...(d.metadata || {}), title: newTitle } } : d));
    } catch (err) { console.error(err); alert("Erreur lors du renommage"); }
    setEditingId(null); setNewTitle("");
  };
  const trashDoc = async (doc) => {
    try { await api.delete(`/doc/${doc.doc_id}`); setDocs((p) => p.filter((d) => d.doc_id !== doc.doc_id)); api.get(`/trash`).then(({ data }) => setTrash(data)); }
    catch { alert("Erreur lors de la suppression"); }
  };
  const restoreDoc = async (doc) => {
    try { await api.post(`/doc/${doc.doc_id}/restore`); setTrash((p) => p.filter((d) => d.doc_id !== doc.doc_id)); api.get(`/list_docs`).then(({ data }) => setDocs(data)); }
    catch { alert("Erreur lors de la restauration"); }
  };
  const purgeDoc = async (doc) => {
    if (!window.confirm("Supprimer DÉFINITIVEMENT ce document ? Irréversible.")) return;
    try { await api.delete(`/doc/${doc.doc_id}/permanent`); setTrash((p) => p.filter((d) => d.doc_id !== doc.doc_id)); }
    catch { alert("Erreur"); }
  };
  const removeShared = async (item) => {
    try { await api.delete(`/shared_with_me/${item.token}`); setShared((p) => p.filter((s) => s.token !== item.token)); }
    catch { alert("Erreur"); }
  };

  const openShare = async (doc) => {
    try {
      const { data } = await api.post(`/doc/${doc.doc_id}/share`);
      setDocs((p) => p.map((d) => d.doc_id === doc.doc_id ? { ...d, shared: true } : d));
      setShareBox({ doc, url: `${window.location.origin}/share/${data.share_token}` }); setCopied(false);
    } catch { alert("Impossible de créer le lien"); }
  };
  const revokeShare = async () => {
    try { await api.delete(`/doc/${shareBox.doc.doc_id}/share`); setDocs((p) => p.map((d) => d.doc_id === shareBox.doc.doc_id ? { ...d, shared: false } : d)); setShareBox(null); }
    catch { alert("Erreur"); }
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareBox.url); setCopied(true); } catch {} };

  // Menu d'actions d'un document (partagé entre vues)
  const docDropdown = (doc, title) => (
    <>
      <div onClick={() => setMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
      <div style={dropdown}>
        <button onClick={() => { setMenuId(null); openShare(doc); }} style={menuItem}>Partager</button>
        <button onClick={() => { setMenuId(null); setMoveDoc(doc); }} style={menuItem}>Déplacer vers…</button>
        <button onClick={() => { setMenuId(null); setEditingId(doc.doc_id); setNewTitle(title); }} style={menuItem}>Renommer</button>
        <button onClick={() => { setMenuId(null); trashDoc(doc); }} style={{ ...menuItem, color: "var(--danger)" }}>Mettre à la corbeille</button>
      </div>
    </>
  );

  const rootDocs = docs.filter((d) => !d.folder);
  const folderDocs = (fid) => docs.filter((d) => d.folder === fid);
  const visibleDocs = currentFolder ? folderDocs(currentFolder) : rootDocs;
  const openFolder = folders.find((f) => f.id === currentFolder);
  const counts = { mine: docs.length, shared: shared.length, trash: trash.length };
  const tabs = [
    { id: "mine", label: "Mes documents", icon: "📁" },
    { id: "shared", label: "Partagés avec moi", icon: "🔗" },
    { id: "trash", label: "Corbeille", icon: "🗑️" },
  ];

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ padding: "24px 28px 0" }}>
        <h1 style={{ margin: 0, color: "var(--title)" }}>Ma bibliothèque</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 16, borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setCurrentFolder(null); }} style={{
              padding: "10px 16px", background: "transparent", border: "none", cursor: "pointer", fontSize: 15,
              color: tab === t.id ? "var(--primary)" : "var(--text)", fontWeight: tab === t.id ? 700 : 500,
              borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent", marginBottom: -1,
            }}>{t.icon} {t.label} <span style={{ opacity: 0.5, fontSize: 13 }}>({counts[t.id]})</span></button>
          ))}
        </div>
      </div>

      {/* ====== MES DOCUMENTS ====== */}
      {tab === "mine" && (
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={onDrop} style={{ position: "relative", padding: "16px 28px 40px", minHeight: 300 }}>
          {/* Barre d'actions épurée */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, opacity: 0.85 }}>
              <span onClick={() => setCurrentFolder(null)} style={{ cursor: "pointer", fontWeight: currentFolder ? 500 : 700 }}>Tous les fichiers</span>
              {openFolder && <span> <span style={{ opacity: 0.5 }}>/</span> <strong>📁 {openFolder.name}</strong></span>}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {/* Sélecteur de vue */}
              <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                {[["grid", "▦", "Grille"], ["compact", "▤", "Compact"], ["list", "≣", "Liste"]].map(([v, icon, label]) => (
                  <button key={v} onClick={() => setView(v)} title={label} style={{ padding: "8px 11px", background: view === v ? "var(--primary)" : "var(--card)", color: view === v ? "#fff" : "var(--text)", border: "none", cursor: "pointer", fontSize: 15 }}>{icon}</button>
                ))}
              </div>
              <button onClick={() => { setNewFolder(true); setFolderName(""); }} style={ghostBtn}>＋ Dossier</button>
              <button onClick={() => fileInputRef.current?.click()} style={solidBtn}>⬆ Importer</button>
              <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
            </div>
          </div>

          {uploading && <div style={{ marginBottom: 16, fontWeight: 600, opacity: 0.8 }}><span className="bt-dots">Import et indexation en cours</span></div>}

          {/* Dossiers (racine uniquement) */}
          {!currentFolder && folders.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Grid>
                {folders.map((f) => (
                  <div key={f.id} className="bt-card" style={{ position: "relative", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", boxShadow: "var(--shadow)" }} onClick={() => setCurrentFolder(f.id)}>
                    <div style={{ fontSize: 30 }}>📁</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{folderDocs(f.id).length} document(s)</div>
                    </div>
                    <button className="bt-kebab-inline" onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === f.id ? null : f.id); }} style={kebabInline}>⋯</button>
                    {folderMenuId === f.id && (
                      <>
                        <div onClick={(e) => { e.stopPropagation(); setFolderMenuId(null); }} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                        <div style={{ ...dropdown, top: 48 }}>
                          <button onClick={(e) => { e.stopPropagation(); setFolderMenuId(null); renameFolder(f); }} style={menuItem}>Renommer</button>
                          <button onClick={(e) => { e.stopPropagation(); setFolderMenuId(null); deleteFolder(f); }} style={{ ...menuItem, color: "var(--danger)" }}>Supprimer</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </Grid>
            </div>
          )}

          {/* Documents */}
          {visibleDocs.length === 0 && (currentFolder || folders.length === 0) ? (
            <Empty text={currentFolder ? "Ce dossier est vide. Importe un PDF ou déplace-en un ici." : "Aucun document. Importe ton premier PDF !"} />
          ) : view === "list" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visibleDocs.map((doc) => {
                const title = doc.metadata?.title || doc.file_name || "Sans titre";
                const open = () => window.open(`/reader/${doc.doc_id}`, "_blank");
                return (
                  <div key={doc.doc_id} className="bt-card" style={listRow}>
                    <div onClick={open} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}>
                      {doc.thumb_url ? <img src={mediaUrl(doc.thumb_url)} alt="" style={{ width: 30, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} /> : <span style={{ fontSize: 20 }}>📄</span>}
                      {editingId === doc.doc_id ? (
                        <input value={newTitle} autoFocus onClick={(e) => e.stopPropagation()} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRename(doc)} style={{ ...inp, flex: 1 }} />
                      ) : <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}{doc.shared ? " 🔗" : ""}</span>}
                    </div>
                    <span style={{ fontSize: 13, opacity: 0.6, width: 100, textAlign: "right", flexShrink: 0 }}>{(doc.created_at || "").slice(0, 10)}</span>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === doc.doc_id ? null : doc.doc_id); }} style={kebabInline}>⋯</button>
                      {menuId === doc.doc_id && docDropdown(doc, title)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Grid view={view}>
              {visibleDocs.map((doc) => {
                const title = doc.metadata?.title || doc.file_name || "Sans titre";
                const open = () => window.open(`/reader/${doc.doc_id}`, "_blank");
                return (
                  <Card key={doc.doc_id} thumb={doc.thumb_url ? mediaUrl(doc.thumb_url) : null} title={title} onOpen={open} badge={doc.shared ? "🔗 Partagé" : null} compact={view === "compact"}>
                    <button className="bt-kebab" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === doc.doc_id ? null : doc.doc_id); }} style={kebab}>⋯</button>
                    {menuId === doc.doc_id && docDropdown(doc, title)}
                    <div style={{ padding: view === "compact" ? 8 : 12, borderTop: "1px solid var(--border)" }}>
                      {editingId === doc.doc_id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={newTitle} autoFocus onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRename(doc)} style={inp} />
                          <button onClick={() => confirmRename(doc)} style={{ ...btn, background: "var(--success)" }}>OK</button>
                        </div>
                      ) : <div onClick={open} title={title} style={{ ...titleStyle, fontSize: view === "compact" ? 13 : 15 }}>{title}</div>}
                    </div>
                  </Card>
                );
              })}
            </Grid>
          )}

          {/* Overlay glisser-déposer */}
          {dragOver && (
            <div style={{ position: "absolute", inset: 12, border: "2px dashed var(--primary)", borderRadius: 16, background: "rgba(69,135,240,0.08)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5, fontWeight: 700, color: "var(--primary)" }}>
              Dépose tes PDF ici{openFolder ? ` dans « ${openFolder.name} »` : ""}
            </div>
          )}
        </div>
      )}

      {/* ====== PARTAGÉS AVEC MOI ====== */}
      {tab === "shared" && (
        <div style={{ padding: "24px 28px 40px" }}>
          {shared.length === 0 ? <Empty text="Aucun document partagé avec toi. Ouvre un lien de partage pour le retrouver ici." /> : (
            <Grid>
              {shared.map((item) => {
                const open = () => window.open(`/share/${item.token}`, "_blank");
                return (
                  <Card key={item.token} thumb={null} title={item.title} onOpen={open} badge={`de ${item.owner_email}`}>
                    <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
                      <button onClick={open} style={{ ...btn, background: "var(--primary)", flex: 1 }}>Ouvrir</button>
                      <button onClick={() => removeShared(item)} style={{ ...btn, background: "var(--accent)" }}>Retirer</button>
                    </div>
                  </Card>
                );
              })}
            </Grid>
          )}
        </div>
      )}

      {/* ====== CORBEILLE ====== */}
      {tab === "trash" && (
        <div style={{ padding: "24px 28px 40px" }}>
          {trash.length === 0 ? <Empty text="La corbeille est vide." /> : (
            <Grid>
              {trash.map((doc) => {
                const title = doc.metadata?.title || doc.file_name || "Sans titre";
                return (
                  <Card key={doc.doc_id} thumb={doc.thumb_url ? mediaUrl(doc.thumb_url) : null} title={title} dimmed>
                    <div style={{ padding: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 6 }}>
                      <button onClick={() => restoreDoc(doc)} style={{ ...btn, background: "var(--success)", flex: 1 }}>Restaurer</button>
                      <button onClick={() => purgeDoc(doc)} style={{ ...btn, background: "var(--danger)" }}>Supprimer</button>
                    </div>
                  </Card>
                );
              })}
            </Grid>
          )}
        </div>
      )}

      {/* Modale nouveau dossier */}
      {newFolder && (
        <Modal onClose={() => setNewFolder(false)}>
          <h3 style={{ margin: "0 0 16px", color: "var(--title)" }}>📁 Nouveau dossier</h3>
          <input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} placeholder="Nom du dossier" style={{ ...inp, width: "100%" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button onClick={() => setNewFolder(false)} style={ghostBtn}>Annuler</button>
            <button onClick={createFolder} style={solidBtn}>Créer</button>
          </div>
        </Modal>
      )}

      {/* Modale déplacer */}
      {moveDoc && (
        <Modal onClose={() => setMoveDoc(null)}>
          <h3 style={{ margin: "0 0 16px", color: "var(--title)" }}>Déplacer vers…</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
            <button onClick={() => moveTo(null)} style={moveItem}>Tous les fichiers (racine)</button>
            {folders.map((f) => <button key={f.id} onClick={() => moveTo(f.id)} style={moveItem}>{f.name}</button>)}
            {folders.length === 0 && <p style={{ opacity: 0.6, fontSize: 14 }}>Aucun dossier. Crée-en un d'abord.</p>}
          </div>
        </Modal>
      )}

      {/* Modale partage */}
      {shareBox && (
        <Modal onClose={() => setShareBox(null)}>
          <h3 style={{ margin: "0 0 4px", color: "var(--title)" }}>🔗 Lien de partage</h3>
          <p style={{ margin: "0 0 16px", fontSize: 13.5, opacity: 0.7 }}>Toute personne disposant de ce lien peut <strong>lire</strong> ce document. Les questions restent réservées aux comptes connectés.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={shareBox.url} onFocus={(e) => e.target.select()} style={{ ...inp, flex: 1, fontSize: 13 }} />
            <button onClick={copyLink} style={{ ...solidBtn, background: copied ? "var(--success)" : "var(--primary)" }}>{copied ? "✓ Copié" : "Copier"}</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button onClick={revokeShare} style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}>Révoquer</button>
            <button onClick={() => setShareBox(null)} style={ghostBtn}>Fermer</button>
          </div>
        </Modal>
      )}

      <footer style={{ textAlign: "center", padding: 24, opacity: 0.6 }}>
        <a style={{ color: "var(--text)" }} href="/privacy">Politique de confidentialité</a>
      </footer>
    </div>
  );
}

function Grid({ children, view }) {
  const min = view === "compact" ? 140 : 200;
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: view === "compact" ? 12 : 20 }}>{children}</div>;
}
function Empty({ text }) { return <p style={{ opacity: 0.7, textAlign: "center", padding: "40px 0" }}>{text}</p>; }
function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>{children}</div>
    </div>
  );
}
function Card({ thumb, title, onOpen, badge, dimmed, compact, children }) {
  return (
    <div className="bt-card" style={{ position: "relative", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "var(--shadow)", opacity: dimmed ? 0.65 : 1, transition: "transform .15s ease, box-shadow .15s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 22px rgba(0,0,0,0.18)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "var(--shadow)"; }}>
      <div onClick={onOpen} style={{ cursor: onOpen ? "pointer" : "default", aspectRatio: "3 / 4", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {thumb ? <img src={thumb} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          : <div style={{ fontSize: 48, opacity: 0.35 }}>📄</div>}
        {badge && <div style={{ position: "absolute", top: 8, left: 8, fontSize: 11, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "3px 8px", borderRadius: 20 }}>{badge}</div>}
      </div>
      {children}
    </div>
  );
}

const btn = { padding: "8px 10px", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" };
const solidBtn = { padding: "9px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600 };
const ghostBtn = { padding: "9px 16px", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", fontWeight: 600 };
const inp = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" };
const titleStyle = { cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 15 };
const kebab = { position: "absolute", top: 8, right: 8, zIndex: 11, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const kebabInline = { width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 16, cursor: "pointer" };
const dropdown = { position: "absolute", top: 42, right: 8, zIndex: 12, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", overflow: "hidden", minWidth: 200, display: "flex", flexDirection: "column" };
const menuItem = { textAlign: "left", padding: "10px 14px", background: "var(--card)", color: "var(--text)", border: "none", cursor: "pointer", fontSize: 14 };
const moveItem = { textAlign: "left", padding: "12px 14px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", fontSize: 14 };
const listRow = { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow)" };
