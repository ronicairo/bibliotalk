import { BrowserRouter as Router, Routes, Route, Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";
import PrivacyPage from "./pages/PrivacyPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import SharePage from "./pages/SharePage";
import LandingPage from "./pages/LandingPage";
import SettingsPage from "./pages/SettingsPage";
import { ThemeProvider } from "./theme/ThemeProvider";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import useIsMobile from "./hooks/useIsMobile";
import "./theme/theme.css";

function NavBar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const doLogout = () => { logout(); navigate("/login"); };

  return (
    <nav style={{ flexShrink: 0, height: 56, padding: "0 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card)" }}>
      <Link to="/library" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--title)", textDecoration: "none", fontWeight: 700, fontSize: 18 }}>
        <img src="/logo1.png" alt="BiblioTalk" style={{ height: 34, width: 34, borderRadius: 8 }} />
        BiblioTalk
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }}>
        {isAdmin && <Link to="/admin" style={navLink}>Admin</Link>}
        {!isMobile && <span style={{ fontSize: 13, opacity: 0.7, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</span>}
        <Link to="/settings" title="Paramètres" style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", textDecoration: "none", fontSize: 16 }}>
          <i className="bi bi-gear"></i>
        </Link>
        <button onClick={doLogout} style={{ padding: "7px 14px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>Déconnexion</button>
      </div>
    </nav>
  );
}

const navLink = { color: "var(--text)", textDecoration: "none", fontWeight: 600 };

// Mise en page protégée : pleine hauteur, nav fixe, contenu qui remplit le reste
function ProtectedLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <NavBar />
      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Outlet />
      </main>
    </div>
  );
}

function AdminRoute({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/library" replace />;
}

// Accueil public : vitrine pour les visiteurs, bibliothèque pour les connectés
function Home() {
  const { user } = useAuth();
  return user ? <Navigate to="/library" replace /> : <LandingPage />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/reader/:docId" element={<ReaderPage />} />
              <Route path="/admin" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
