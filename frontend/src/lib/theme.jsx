import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage can be blocked */ } };

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => read("opti-theme", "dark"));      // dark | light | system
  const [motion, setMotion] = useState(() => read("opti-motion", "system")); // system | reduced
  const [system, setSystem] = useState(() => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = (e) => setSystem(e.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const effective = theme === "system" ? system : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = effective;
    document.documentElement.dataset.motion = motion === "reduced" ? "reduced" : "";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effective === "dark" ? "#05070d" : "#f2f4fa");
  }, [effective, motion]);

  const value = useMemo(() => ({
    theme, effective, motion,
    setTheme: (t) => { setTheme(t); write("opti-theme", t); },
    setMotion: (m) => { setMotion(m); write("opti-motion", m); },
    toggle: () => { const next = effective === "dark" ? "light" : "dark"; setTheme(next); write("opti-theme", next); },
  }), [theme, effective, motion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
