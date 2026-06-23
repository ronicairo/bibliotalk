import { Link } from "react-router-dom";
import { ThemeToggle } from "../theme/ThemeProvider";

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Barre du haut */}
      <header style={{ display: "flex", alignItems: "center", padding: "16px 28px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 20, color: "var(--title)" }}>
          <img src="/logo1.png" alt="BiblioTalk" style={{ height: 38, width: 38, borderRadius: 9 }} />
          BiblioTalk
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
          <Link to="/login" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600, padding: "9px 14px" }}>Se connecter</Link>
          <Link to="/register" style={{ ...primaryBtn, padding: "9px 18px" }}>S'inscrire</Link>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 28px 40px", textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 20, background: "rgba(69,135,240,0.12)", color: "var(--primary)", fontWeight: 600, fontSize: 14, marginBottom: 24 }}>
          Ta bibliothèque intelligente
        </div>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 54px)", lineHeight: 1.1, margin: "0 0 20px", color: "var(--title)", fontWeight: 800 }}>
          Tes documents,<br />et une IA qui les comprend.
        </h1>
        <p style={{ fontSize: "clamp(16px, 2.2vw, 20px)", opacity: 0.75, maxWidth: 640, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Range tes PDF en lieu sûr, puis <strong>pose-leur des questions</strong> : BiblioTalk lit le contenu et te répond,
          en citant les pages. Importe, ouvre, interroge — c'est tout.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/register" style={{ ...primaryBtn, padding: "14px 28px", fontSize: 16 }}>Commencer gratuitement</Link>
          <Link to="/login" style={{ ...ghostBtn, padding: "14px 28px", fontSize: 16 }}>J'ai déjà un compte</Link>
        </div>
      </section>

      {/* Aperçu visuel */}
      <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 28px 60px" }}>
        <img src="/hero-img1.png" alt="Aperçu de BiblioTalk : interroger un document et obtenir des réponses précises"
          style={{ width: "100%", display: "block", borderRadius: 18, boxShadow: "0 24px 70px rgba(0,0,0,0.22)" }} />
      </section>

      {/* Fonctionnalités */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 28px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {features.map((f) => (
            <div key={f.title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, boxShadow: "var(--shadow)" }}>
              <div style={{ fontSize: 34, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ margin: "0 0 8px", color: "var(--title)" }}>{f.title}</h3>
              <p style={{ margin: 0, opacity: 0.72, lineHeight: 1.6, fontSize: 15 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 28px" }}>
        <h2 style={{ textAlign: "center", color: "var(--title)", fontSize: 30, marginBottom: 36 }}>Comment ça marche</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}>
          {steps.map((s, i) => (
            <div key={s.title} style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, margin: "0 auto 16px" }}>{i + 1}</div>
              <h3 style={{ margin: "0 0 8px", color: "var(--title)" }}>{s.title}</h3>
              <p style={{ margin: 0, opacity: 0.72, lineHeight: 1.6, fontSize: 15 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section style={{ maxWidth: 760, margin: "20px auto 0", padding: "0 28px" }}>
        <div style={{ background: "linear-gradient(135deg, var(--primary), #6aa3f5)", borderRadius: 20, padding: "44px 28px", textAlign: "center", color: "#fff" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 28 }}>Prêt à discuter avec tes documents ?</h2>
          <p style={{ margin: "0 0 24px", opacity: 0.9 }}>Crée ton compte en quelques secondes. C'est gratuit.</p>
          <Link to="/register" style={{ display: "inline-block", padding: "14px 30px", background: "#fff", color: "var(--primary)", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>Commencer gratuitement</Link>
        </div>
      </section>

      <footer style={{ textAlign: "center", padding: "40px 20px", opacity: 0.6, fontSize: 14 }}>
        <Link to="/privacy" style={{ color: "var(--text)" }}>Politique de confidentialité</Link>
        <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} BiblioTalk</div>
      </footer>
    </div>
  );
}

const primaryBtn = { background: "var(--primary)", color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none" };
const ghostBtn = { background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, fontWeight: 600, textDecoration: "none" };

const features = [
  { icon: "📚", title: "Range tes PDF", text: "Une bibliothèque personnelle et privée. Importe par glisser-déposer, organise, retrouve tout en un coup d'œil." },
  { icon: "💬", title: "Interroge-les", text: "Pose des questions en langage naturel. L'IA lit le contenu et répond précisément, en citant les pages." },
  { icon: "🔗", title: "Partage en un lien", text: "Génère un lien de lecture pour n'importe qui, sans compte. Révocable à tout moment." },
  { icon: "🔒", title: "Privé & sécurisé", text: "Chaque document n'est visible que par toi. Tes fichiers sont protégés derrière ton compte." },
];

const steps = [
  { title: "Importe", text: "Glisse tes PDF dans ta bibliothèque. Ils sont indexés automatiquement." },
  { title: "Ouvre", text: "Clique sur un document pour le lire dans la visionneuse intégrée." },
  { title: "Pose tes questions", text: "Discute avec ton document : résumés, chiffres, dates… réponses sourcées." },
];
