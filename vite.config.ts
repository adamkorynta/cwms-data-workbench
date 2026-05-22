import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/cwms-data-workbench/" : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/plotly.js") || id.includes("node_modules/react-plotly.js")) {
            return "plotly";
          }

          if (id.includes("node_modules/leaflet") || id.includes("node_modules/react-leaflet")) {
            return "maps";
          }

          if (id.includes("node_modules/cwmsjs")) {
            return "cwmsjs";
          }

          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["localhost", "tacocat"],
    port: 5173,
    strictPort: false,
  },
}));
