import { readFileSync } from 'node:fs';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig } from 'vite';

import { DEFAULT_SERVER_PORT, DEFAULT_WEB_DEV_PORT } from '@glade/shared';

const port = Number(process.env.PORT ?? DEFAULT_WEB_DEV_PORT);
const serverPort = Number(process.env.BAYESGROVE_SERVER_PORT ?? DEFAULT_SERVER_PORT);
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: {
    __GLADE_VERSION__: JSON.stringify(packageJson.version),
  },
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
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name(id) {
                if (!id.includes('node_modules')) {
                  return;
                }

                if (id.includes('@xyflow')) {
                  return 'xyflow-vendor';
                }

                if (id.includes('d3-')) {
                  return 'd3-vendor';
                }

                if (id.includes('xterm')) {
                  return 'terminal-vendor';
                }

                if (id.includes('@tanstack')) {
                  return 'tanstack-vendor';
                }

                if (id.includes('@base-ui') || id.includes('react-hook-form')) {
                  return 'ui-vendor';
                }

                if (id.includes('/node_modules/effect/') || id.includes('/node_modules/@effect/')) {
                  return 'effect-vendor';
                }

                if (id.includes('react') || id.includes('scheduler')) {
                  return 'react-vendor';
                }
              },
            },
          ],
        },
      },
    },
  },
});
