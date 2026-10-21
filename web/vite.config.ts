import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 開發時：npm run dev（5173）→ /api、/files 轉給 FastAPI（8765）
// 正式：npm run build → 輸出到 ../app/static，由 FastAPI 直接提供
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "../app/static", emptyOutDir: true },
  // npm test：vitest 只跑 src/**/*.test.ts（純函式、store 邏輯；不需要瀏覽器）
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  server: {
    proxy: { "/api": "http://127.0.0.1:8765", "/files": "http://127.0.0.1:8765" },
  },
});
