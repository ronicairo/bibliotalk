import { useState } from "react";
import axios from "axios";

export default function UserPage() {
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState("");
  const [question, setQuestion] = useState("");
  const [resp, setResp] = useState(null);
  const [loading, setLoading] = useState(false);

  const uploadPdf = async () => {
    if (!file) return alert("Choisis un PDF");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await axios.post("http://localhost:8000/upload", form);
      setDocId(data.doc_id);
      alert("PDF importé !");
    } catch (err) {
      alert("Erreur lors de l'upload");
    } finally {
      setLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!docId) return alert("Upload d’abord un PDF");
    if (!question.trim()) return alert("Entre une question !");
    setLoading(true);
    try {
      const { data } = await axios.post("http://localhost:8000/ask", {
        doc_id: docId,
        question,
      });
      setResp(data);
    } catch (err) {
      alert("Erreur lors de la requête");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: "Arial, sans-serif",
      maxWidth: "700px",
      margin: "40px auto",
      padding: "20px"
    }}>
 <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <img src="/logo2.png" alt="Bibliotalk Logo" style={{ height: "60px", marginBottom: "10px" }} />
        <h1 style={{ color: "#eb6425ff" }}>Bibliotalk</h1>
      </div>

      {/* Upload Section */}
      <div style={{
        padding: "20px",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        marginBottom: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
      }}>
        <h3 style={{ marginBottom: "10px" }}>Uploader un PDF</h3>
        <input
          type="file"
          onChange={e => setFile(e.target.files[0])}
          style={{ marginBottom: "10px" }}
        />
        <br />
        <button
          onClick={uploadPdf}
          disabled={loading}
          style={{
            padding: "10px 20px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          {loading ? "Chargement..." : "Upload"}
        </button>
        {docId && <p style={{ marginTop: "10px", fontSize: "0.9em", color: "#16a34a" }}>✅ Document chargé</p>}
      </div>

      {/* Question Section */}
<div style={{
  padding: "20px",
  border: "1px solid #333",
  borderRadius: "12px",
  marginBottom: "20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  textAlign: "center"   // ✅ ajoute pour centrer le contenu
}}>
  <h3 style={{ marginBottom: "10px" }}>Poser une question</h3>
  <input
    placeholder="Ex: Quel est le titre du document ?"
    value={question}
    onChange={e => setQuestion(e.target.value)}
    style={{
      width: "80%",              // ✅ réduit largeur
      maxWidth: "500px",         // ✅ limite max
      padding: "10px",
      border: "1px solid #555",
      borderRadius: "8px",
      marginBottom: "10px",
      backgroundColor: "#1f2937", // gris foncé
      color: "#f3f4f6"            // texte clair
    }}
  />
  <br />
  <button
    onClick={askQuestion}
    disabled={loading}
    style={{
      padding: "10px 20px",
      backgroundColor: "#16a34a",
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer"
    }}
  >
    {loading ? "Recherche..." : "Demander"}
  </button>
</div>


      {/* Answer Section */}
      {resp && (
        <div style={{
  padding: "20px",
  border: "1px solid #333",
  borderRadius: "12px",
  backgroundColor: "#1f2937",  // gris foncé
  boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
}}>
  <h3 style={{ marginBottom: "10px", color: "#f3f4f6" }}>Réponse :</h3>
  <p style={{ fontSize: "1.2em", color: "#f3f4f6" }}>
    <b>{resp.answer}</b>
  </p>
  <p style={{ fontSize: "0.9em", color: "#9ca3af" }}>
    Score : {resp.score}
  </p>
</div>
      )}
    </div>
  );
}
