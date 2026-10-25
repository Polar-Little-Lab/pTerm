import { defineConfig } from 'vite';
export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: {terminal:['@xterm/xterm','@xterm/addon-fit'],react:['react','react-dom']} } } },
  clearScreen: false,
});
