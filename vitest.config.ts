import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const contractsEntry = fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url));
const sharedEntry = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));
const sharedDir = fileURLToPath(new URL('./packages/shared/src/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@glade\/shared\/(.+)$/,
        replacement: `${sharedDir}$1.ts`,
      },
      {
        find: '@glade/shared',
        replacement: sharedEntry,
      },
      {
        find: '@glade/contracts',
        replacement: contractsEntry,
      },
    ],
  },
  test: {
    watch: false,
  },
});
