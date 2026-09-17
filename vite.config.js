import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 项目站点挂子路径，必须以仓库名开头，否则打包后的 JS/CSS 会 404
  base: "/DeviceCompare/",
  server: {
    port: 5173,
    strictPort: true
  }
});
