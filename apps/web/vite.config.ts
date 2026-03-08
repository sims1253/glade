import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig } from 'vite';

import { DEFAULT_SERVER_PORT, DEFAULT_WEB_DEV_PORT } from '@glade/shared';

const port = Number(process.env.PORT ?? DEFAULT_WEB_DEV_PORT);
const serverPort = Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT);

export default defineConfig({
  plugins: [
    tanstackRouter(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  server: {
    port,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      clientPort: port,
    },
    proxy: {
      '/health': {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${serverPort}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
