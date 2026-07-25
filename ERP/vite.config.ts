import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.ERP_ASSET_BASE || '/erp/',
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          db: ['dexie', '@cloudbase/js-sdk'],
          state: ['zustand'],
          dayjs: ['dayjs'],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: mode === 'production'
          ? []
          : ['react-dev-locator'],
      },
    }),
    tsconfigPaths()
  ],
}))
