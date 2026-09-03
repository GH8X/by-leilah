import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Route-based code splitting is handled via React.lazy in the app.
    // Keep the vendor chunk for heavy, rarely-changing libs separate.
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
