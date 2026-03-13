import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';

import vitestConfig from './vitest.config';

export default mergeConfig(
  vitestConfig,
  defineConfig({
    optimizeDeps: {
      include: ['@tanstack/react-query', 'vitest-browser-react'],
    },
    test: {
      include: ['src/**/*.browser.tsx'],
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
        headless: true,
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }),
);
