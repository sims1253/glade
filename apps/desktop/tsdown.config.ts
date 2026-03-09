import { defineConfig } from 'tsdown';

const shared = {
  format: 'cjs' as const,
  outDir: 'dist-electron',
  sourcemap: true,
  outExtensions: () => ({ js: '.cjs' }),
  deps: {
    neverBundle: ['electron'],
  },
};

export default defineConfig([
  {
    ...shared,
    entry: ['src/main.ts', 'src/server-process.ts'],
    clean: true,
    deps: {
      ...shared.deps,
      alwaysBundle: (id) => id.startsWith('@glade/'),
      onlyAllowBundle: false,
    },
  },
  {
    ...shared,
    entry: ['src/preload.ts'],
    deps: {
      ...shared.deps,
      onlyAllowBundle: false,
    },
  },
]);
