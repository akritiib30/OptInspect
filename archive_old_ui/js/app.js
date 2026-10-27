// Router and page frame. Each page is its own module in ./pages and is loaded when first visited.
import { $, el, api, icon } from "./ui.js";

const NAV = [
  ["dashboard", "Overview", "#/"], ["inspect", "Inspect", "#/inspect"], ["history", "History", "#/history"],
  ["review", "Review", "#/review"], ["audit", "Audit log", "#/audit"], ["products", "Products", "#/products"],
  ["how", "How it works", "#/how"],
];
const ROUTES = [
  [/^\/?$/, "dashboard", "dashboard", "Overview"],
  [/^\/inspect$/, "inspect", "inspect", "Inspect a photo"],
  [/^\/inspection\/([\w-]+)$/, "history", "detail", "Inspection"],
  [/^\/history$/, "history", "history", "History"],
  [/^\/review(?:\/([\w-]+)(?:\/(\d+))?)?$/, "review", "review", "Review"],
  [/^\/audit(?:\/([\w-]+))?$/, "audit", "audit", "Audit log"],
  [/^\/products$/, "products", "products", "Products"],
  [/^\/how$/, "how", "how", "How it works"],
];

// ---------- theme ----------
const root = document.documentElement;
function savedTheme() { try { return localStorage.getItem("theme"); } catch { return null; } }
function setTheme(t) { root.dataset.theme = t; try { localStorage.setItem("theme", t); } catch { /* storage may be blocked */ } }
root.dataset.theme = savedTheme() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

// ---------- navigation rail ----------
const rail = $("#rail");
const themeBtn = el("button", { class: "linkish", type: "button" });
const status = el("div", { class: "status" }, el("i"), el("span", { text: "Server connected" }));
function paintTheme() {
  const dark = root.dataset.theme === "dark";
  themeBtn.replaceChildren(icon(dark ? "sun" : "moon"), dark ? "Light theme" : "Dark theme");
}
themeBtn.addEventListener("click", () => { setTheme(root.dataset.theme === "dark" ? "light" : "dark"); paintTheme(); });
paintTheme();

const logo = `<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#0E1318"/><path d="M8 12V9h3M21 9h3v3M24 20v3h-3M11 23H8v-3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="16" cy="16" r="3" fill="#6CA0F5"/></svg>`;
const brand = el("a", { class: "brand", href: "#/", "aria-label": "Adaptive Inspector, overview" });
brand.innerHTML = logo; // fixed markup
brand.append(el("span", {}, el("b", { text: "Adaptive Inspector" }), el("small", { text: "Visual quality control" })));
const navLinks = NAV.map(([key, label, href]) => {
  const count = key === "review" ? el("span", { class: "count hide", id: "review-count" }) : null;
  return el("a", { class: "nav", href, "data-key": key }, icon(key, 19), el("span", { class: "label", text: label }), count);
});
rail.append(brand, ...navLinks, el("div", { class: "rail-foot" }, status, themeBtn));

function markNav(key) {
  navLinks.forEach((a) => {
    const on = a.dataset.key === key;
    a.classList.toggle("on", on);
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
}

async function refreshBadge() {
  try {
    const s = await api("/api/stats");
    const c = $("#review-count");
    c.textContent = s.awaiting_review;
    c.classList.toggle("hide", !s.awaiting_review);
    c.setAttribute("aria-label", `${s.awaiting_review} waiting`);
    status.classList.remove("down");
    status.lastChild.textContent = "Server connected";
  } catch {
    status.classList.add("down");
    status.lastChild.textContent = "Server not reachable";
  }
}

// ---------- router ----------
let token = 0, cleanup = null;

async function render() {
  const mine = ++token;
  if (typeof cleanup === "function") { cleanup(); cleanup = null; }
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const route = ROUTES.find((r) => r[0].test(path));
  const view = $("#view");
  if (!route) {
    view.replaceChildren(el("div", { class: "page" }, el("div", { class: "panel" }, el("div", { class: "empty" },
      el("h3", { text: "This page does not exist" }), el("a", { class: "btn", href: "#/" }, "Go to the overview")))));
    return;
  }
  markNav(route[1]);
  document.title = `${route[3]} - Adaptive Inspector`;
  const page = el("div", { class: "page" });
  const ctx = { args: path.match(route[0]).slice(1), query: new URLSearchParams(qs || ""), refresh: render, badge: refreshBadge };
  try {
    const mod = await import(`./pages/${route[2]}.js`);
    const result = await mod.default(page, ctx);
    if (mine !== token) { if (typeof result === "function") result(); return; }
    cleanup = result;
  } catch (err) {
    if (mine !== token) return;
    page.replaceChildren(el("div", { class: "panel" }, el("div", { class: "empty" },
      el("h3", { text: "This page could not load" }), el("p", { class: "muted", text: err.message }),
      el("button", { class: "btn quiet", type: "button", onclick: render }, "Try again"))));
  }
  view.replaceChildren(page);
  window.scrollTo(0, 0);
  refreshBadge();
}

addEventListener("hashchange", render);
render();
setInterval(refreshBadge, 15000);
