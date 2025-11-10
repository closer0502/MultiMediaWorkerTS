/// <reference types="vitest" />
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: UserConfig & { test: Record<string, unknown> } = {
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src')
    }
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: path.join(__dirname, 'tests/setupTests.ts'),
    globals: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/files': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173
  }
};

export default defineConfig(config);
