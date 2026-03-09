import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/process.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  checks: {
    pluginTimings: false,
  },
});
