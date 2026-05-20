import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "production" ? "/cwms-data-workbench/" : "/",
  server: {
    host: "0.0.0.0",
    allowedHosts: ["localhost", "tacocat"],
    port: 5173,
    strictPort: false,
  },
}));
