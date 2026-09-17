import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Raíz real del proyecto, inyectada en el bundle como __RAIZ_PROYECTO__:
// la carpeta de datos sugerida en dev es válida en cualquier máquina,
// no solo donde se creó el proyecto (ver src/utils/carpetaDatos.ts).
const raizProyecto = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  define: {
    __RAIZ_PROYECTO__: JSON.stringify(raizProyecto),
  },

  build: {
    rollupOptions: {
      output: {
        // Particionado mínimo: solo los grupos que son estables y rentables.
        // El resto (incluido el árbol de jsPDF) NO se asigna a mano: Rollup
        // lo agrupa siguiendo el grafo de imports, de modo que el árbol de
        // jsPDF queda en el chunk perezoso del exportador de PDF (solo se
        // descarga al generar un acta) y sin ciclos entre chunks.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)
          ) {
            return "react-vendor";
          }
          if (
            /recharts|react-smooth|victory-vendor|d3-|@reduxjs|react-redux|es-toolkit|recompose/.test(id)
          ) {
            return "recharts";
          }
          // Vendor conocido y estable (cacheable entre releases). Lo demás
          // queda libre para que Rollup lo siga el grafo de imports.
          if (
            /[\\/]node_modules[\\/](@tauri-apps|@tanstack|papaparse|lucide-react|react-icons|clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id)
          ) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
