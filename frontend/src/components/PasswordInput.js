import { useState } from "react";

// Champ mot de passe avec bouton œil pour afficher/masquer
export default function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        {...props}
        type={show ? "text" : "password"}
        style={{ ...style, paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        title={show ? "Masquer" : "Afficher"}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--muted)", fontSize: 16, padding: 4, lineHeight: 1,
        }}
      >
        <i className={show ? "bi bi-eye-slash" : "bi bi-eye"}></i>
      </button>
    </div>
  );
}
