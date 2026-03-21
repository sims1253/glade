import { describe, expect, it } from 'vitest';

import { stringifyUnknown } from './runtime-logging';

describe('stringifyUnknown', () => {
  it('returns the stack trace for errors with a stack', () => {
    const err = new Error('oops');
    expect(stringifyUnknown(err)).toBe(err.stack);
  });

  it('returns the message for errors without a stack', () => {
    const err = new Error('no stack');
    delete err.stack;
    expect(stringifyUnknown(err)).toBe('no stack');
  });

  it('returns the string directly for string values', () => {
    expect(stringifyUnknown('hello')).toBe('hello');
    expect(stringifyUnknown('')).toBe('');
  });

  it('JSON-serializes objects', () => {
    expect(stringifyUnknown({ a: 1 })).toBe('{"a":1}');
  });

  it('JSON-serializes arrays', () => {
    expect(stringifyUnknown([1, 2, 3])).toBe('[1,2,3]');
  });

  it('converts numbers to strings via JSON.stringify', () => {
    expect(stringifyUnknown(42)).toBe('42');
  });

  it('falls back to String() for non-serializable values', () => {
    // Circular reference triggers JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const result = stringifyUnknown(circular);
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });
});
