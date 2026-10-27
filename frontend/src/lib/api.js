// Talking to the Flask server. Cookies carry the session; every change also sends a CSRF token.
let csrf = "";
export const setCsrf = (token) => { csrf = token || ""; };

export class ApiError extends Error {
  constructor(message, status = 0, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

async function refreshCsrf() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    const data = await res.json();
    setCsrf(data.csrf);
    return true;
  } catch {
    return false;
  }
}

export async function api(path, { method = "GET", body, form, signal } = {}, retried = false) {
  const headers = {};
  let payload;
  if (method !== "GET") headers["X-CSRF-Token"] = csrf;
  if (form || body instanceof FormData) payload = form || body;   // multipart: let the browser set the boundary
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, signal, credentials: "same-origin" });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Cannot reach the server. Check that python server.py is still running.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && !retried && /out of date/i.test(data.error || "") && (await refreshCsrf())) {
      return api(path, { method, body, form, signal }, true);
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("opti:unauthorized"));
    throw new ApiError(data.error || `The request failed (${res.status}).`, res.status, data.field);
  }
  return data;
}

export const viewUrl = (id, kind = "test", size) => `/api/view/${id}/${kind}${size ? `?size=${size}` : ""}`;
export const thumbUrl = (id, size = 240) => `/api/image/${id}?size=${size}`;
export const productImage = (product, sample, size) =>
  `/api/product-image/${product}/${sample ? `sample/${sample}` : "reference"}${size ? `?size=${size}` : ""}`;
