import path from 'node:path';

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ts', 'text/plain; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

export function contentTypeFor(filePath: string) {
  return CONTENT_TYPES.get(path.extname(filePath)) ?? 'application/octet-stream';
}
