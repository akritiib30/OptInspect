import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run build` writes the app into frontend/dist, which server.py serves.
// `npm run dev` starts a live-reloading copy on :5173 that forwards /api to the Flask server on :5000.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5000" } },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
});
