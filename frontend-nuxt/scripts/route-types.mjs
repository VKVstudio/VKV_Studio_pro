import { createRequire } from 'node:module';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
export const routeTypesPlugin = require.resolve('vue-router/volar/sfc-route-blocks', { paths: [dirname(require.resolve('nuxt/package.json'))] });
