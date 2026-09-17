import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Debe espejar el `define` de vite.config.ts: la raíz del proyecto inyectada
// que usa src/utils/carpetaDatos.ts para sugerir la carpeta de datos en dev.
export default defineConfig({
    plugins: [react()],
    define: {
        __RAIZ_PROYECTO__: JSON.stringify(dirname(fileURLToPath(import.meta.url))),
    },
    test: {
        environment: "jsdom",
        globals: false,
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
