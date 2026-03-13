import { mergeConfig } from 'vitest/config';

import rootVitestConfig from '../../vitest.config';
import viteConfig from './vite.config';

export default mergeConfig(rootVitestConfig, viteConfig);
