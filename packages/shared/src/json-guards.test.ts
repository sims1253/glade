import { describe, expect, it } from 'vitest';

import { asBoolean, asNumber, asRecord, asString, asStringArray } from './json-guards';

describe('asRecord', () => {
  it('returns the object for a plain object', () => {
    const obj = { a: 1, b: 'x' };
    expect(asRecord(obj)).toBe(obj);
  });

  it('returns null for an array', () => {
    expect(asRecord([1, 2, 3])).toBeNull();
  });

  it('returns null for null', () => {
    expect(asRecord(null)).toBeNull();
  });

  it('returns null for a string', () => {
    expect(asRecord('hello')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(asRecord(42)).toBeNull();
  });
});

describe('asString', () => {
  it('returns the value for a string', () => {
    expect(asString('hello')).toBe('hello');
    expect(asString('')).toBe('');
  });

  it('returns null for non-strings', () => {
    expect(asString(42)).toBeNull();
    expect(asString(null)).toBeNull();
    expect(asString(true)).toBeNull();
    expect(asString({})).toBeNull();
  });
});

describe('asNumber', () => {
  it('returns the value for a finite number', () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-3.14)).toBe(-3.14);
  });

  it('returns null for non-finite numbers', () => {
    expect(asNumber(Infinity)).toBeNull();
    expect(asNumber(-Infinity)).toBeNull();
    expect(asNumber(NaN)).toBeNull();
  });

  it('returns null for non-numbers', () => {
    expect(asNumber('42')).toBeNull();
    expect(asNumber(null)).toBeNull();
    expect(asNumber(true)).toBeNull();
  });
});

describe('asBoolean', () => {
  it('returns true for true', () => {
    expect(asBoolean(true)).toBe(true);
  });

  it('returns false for false', () => {
    expect(asBoolean(false)).toBe(false);
  });

  it('returns null for non-booleans', () => {
    expect(asBoolean(0)).toBeNull();
    expect(asBoolean('')).toBeNull();
    expect(asBoolean(null)).toBeNull();
    expect(asBoolean('true')).toBeNull();
  });
});

describe('asStringArray', () => {
  it('returns strings from a mixed array', () => {
    expect(asStringArray(['a', 1, 'b', null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for a non-array', () => {
    expect(asStringArray(null)).toEqual([]);
    expect(asStringArray({})).toEqual([]);
    expect(asStringArray('hello')).toEqual([]);
  });

  it('returns all elements from a string-only array', () => {
    expect(asStringArray(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
  });

  it('returns an empty array for an empty array', () => {
    expect(asStringArray([])).toEqual([]);
  });
});
