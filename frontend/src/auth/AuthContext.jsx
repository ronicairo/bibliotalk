import { createContext, useContext, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bt_user") || "null"); }
    catch { return null; }
  });

  const persist = (token, u) => {
    localStorage.setItem("bt_token", token);
    localStorage.setItem("bt_user", JSON.stringify(u));
    setUser(u);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.token, data.user);
    return data.user;
  };

  const register = async (email, password) => {
    const { data } = await api.post("/auth/register", { email, password });
    persist(data.token, data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("bt_token");
    localStorage.removeItem("bt_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
