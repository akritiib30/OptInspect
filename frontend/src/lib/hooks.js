import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// ---- data fetching with a small cache, optional polling, and no flash when revisiting a page ----
const cache = new Map();
export const clearCache = (prefix = "") => { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); };

export function useApi(path, { interval = 0, enabled = true } = {}) {
  const [state, set] = useState({ path, data: cache.get(path) ?? null, error: null, loading: !cache.has(path) });
  const alive = useRef(true);
  const view = state.path === path ? state : { path, data: cache.get(path) ?? null, error: null, loading: !cache.has(path) };

  const load = useCallback(async (silent = false) => {
    if (!path || !enabled) return null;
    if (!silent && !cache.has(path)) set({ path, data: null, error: null, loading: true });
    try {
      const data = await api(path);
      cache.set(path, data);
      if (alive.current) set({ path, data, error: null, loading: false });
      return data;
    } catch (error) {
      if (alive.current && error.name !== "AbortError") set((s) => ({ path, data: s.path === path ? s.data : null, error, loading: false }));
      return null;
    }
  }, [path, enabled]);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => {
    if (!interval || !enabled) return undefined;
    const id = setInterval(() => { if (!document.hidden) load(true); }, interval);
    return () => clearInterval(id);
  }, [interval, enabled, load]);

  return {
    data: view.data, error: view.error, loading: view.loading && enabled,
    reload: () => load(true),
    setData: (data) => { cache.set(path, data); set({ path, data, error: null, loading: false }); },
  };
}

// ---- a clock that makes "2 min ago" labels keep counting ----
export function useNow(every = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id); }, [every]);
  return now;
}

// ---- keyboard shortcuts: { "k": fn, "ctrl+k": fn }. Ignored while typing in a field. ----
export function useHotkeys(map, { allowInInputs = false } = {}) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.("input, textarea, select, [contenteditable='true']");
      const combo = [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey && e.key.length > 1 ? "shift" : "", e.key.toLowerCase()]
        .filter(Boolean).join("+");
      const fn = ref.current[combo];
      if (!fn) return;
      if (typing && !allowInInputs && !combo.startsWith("ctrl")) return;
      const result = fn(e);
      if (result !== false) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowInInputs]);
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw == null ? initial : JSON.parse(raw); } catch { return initial; }
  });
  const set = useCallback((next) => {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage can be blocked */ }
  }, [key]);
  return [value, set];
}

export function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    on();
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
