import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { decodeJsonResult, decodeUnknownResult, formatSchemaError } from './schema-json';

const Example = Schema.Struct({
  id: Schema.String,
  enabled: Schema.Boolean,
});

describe('schema-json helpers', () => {
  it('decodes JSON strings into typed values', () => {
    const result = decodeJsonResult(Example)('{"id":"example","enabled":true}');

    expect(Either.isRight(result)).toBe(true);
    expect(Either.isRight(result) ? result.right : null).toEqual({
      id: 'example',
      enabled: true,
    });
  });

  it('decodes unknown values against schemas', () => {
    const result = decodeUnknownResult(Example)({ id: 'example', enabled: false });

    expect(Either.isRight(result)).toBe(true);
    expect(Either.isRight(result) ? result.right : null).toEqual({
      id: 'example',
      enabled: false,
    });
  });

  it('formats schema failures with a readable message', () => {
    const result = decodeJsonResult(Example)('{"id":1}');

    expect(Either.isLeft(result)).toBe(true);
    expect(Either.isLeft(result) ? formatSchemaError(result.left) : '').toContain('Expected string');
  });
});
