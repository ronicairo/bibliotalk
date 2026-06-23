import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      onClick={toggleTheme}
      title={isLight ? "Passer en mode sombre" : "Passer en mode clair"}
      aria-label="Changer de thème"
      style={{
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        cursor: "pointer",
        color: "var(--text)",
        fontSize: 16,
        transition: "background 0.15s ease",
      }}
    >
      <i className={isLight ? "bi bi-moon-stars" : "bi bi-sun"}></i>
    </button>
  );
}

