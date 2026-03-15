import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/logging.ts', 'src/net.ts', 'src/process.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  checks: {
    pluginTimings: false,
  },
});
