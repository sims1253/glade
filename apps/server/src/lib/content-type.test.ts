import { describe, expect, it } from 'vitest';

import { contentTypeFor } from './content-type';

describe('contentTypeFor', () => {
  it('returns the correct type for known extensions', () => {
    expect(contentTypeFor('style.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('data.json')).toBe('application/json; charset=utf-8');
    expect(contentTypeFor('module.mjs')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('image.png')).toBe('image/png');
    expect(contentTypeFor('logo.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('types.ts')).toBe('text/plain; charset=utf-8');
    expect(contentTypeFor('font.woff2')).toBe('font/woff2');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(contentTypeFor('archive.zip')).toBe('application/octet-stream');
    expect(contentTypeFor('file.unknown')).toBe('application/octet-stream');
    expect(contentTypeFor('noext')).toBe('application/octet-stream');
  });

  it('handles paths with directories', () => {
    expect(contentTypeFor('/assets/styles/app.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('dist/bundle.js')).toBe('text/javascript; charset=utf-8');
  });
});
