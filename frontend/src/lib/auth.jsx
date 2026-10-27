import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setCsrf } from "./api";
import { clearCache } from "./hooks";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, meta: { first_user: false, signup_open: true, default_role: "reviewer" }, error: null });

  const load = useCallback(async () => {
    try {
      const d = await api("/api/auth/me");
      setCsrf(d.csrf);
      setState({ loading: false, user: d.user, error: null, meta: { first_user: d.first_user, signup_open: d.signup_open, default_role: d.default_role, roles: d.roles } });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onOut = () => { clearCache(); setState((s) => ({ ...s, user: null })); };
    window.addEventListener("opti:unauthorized", onOut);
    return () => window.removeEventListener("opti:unauthorized", onOut);
  }, []);

  const signIn = useCallback(async (email, password, remember) => {
    const d = await api("/api/auth/signin", { method: "POST", body: { email, password, remember } });
    setCsrf(d.csrf);
    clearCache();
    setState((s) => ({ ...s, user: d.user }));
    return d.user;
  }, []);

  const signUp = useCallback(async (name, email, password) => {
    const d = await api("/api/auth/signup", { method: "POST", body: { name, email, password } });
    setCsrf(d.csrf);
    clearCache();
    setState((s) => ({ ...s, user: d.user, meta: { ...s.meta, first_user: false } }));
    return d.user;
  }, []);

  const signOut = useCallback(async () => {
    try { const d = await api("/api/auth/signout", { method: "POST" }); setCsrf(d.csrf); } catch { /* already signed out */ }
    clearCache();
    setState((s) => ({ ...s, user: null }));
  }, []);

  const setUser = useCallback((user) => setState((s) => ({ ...s, user })), []);

  const value = useMemo(() => {
    const role = state.user?.role;
    return {
      ...state, signIn, signUp, signOut, setUser, reload: load,
      can: { inspect: role === "admin" || role === "reviewer", review: role === "admin" || role === "reviewer", admin: role === "admin" },
    };
  }, [state, signIn, signUp, signOut, setUser, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
