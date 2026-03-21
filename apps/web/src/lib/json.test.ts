import { describe, expect, it } from 'vitest';

import { isJsonValue, toJsonObject, toJsonValue } from './json';

describe('isJsonValue', () => {
  it('accepts null', () => {
    expect(isJsonValue(null)).toBe(true);
  });

  it('accepts strings', () => {
    expect(isJsonValue('')).toBe(true);
    expect(isJsonValue('hello')).toBe(true);
  });

  it('accepts booleans', () => {
    expect(isJsonValue(true)).toBe(true);
    expect(isJsonValue(false)).toBe(true);
  });

  it('accepts finite numbers', () => {
    expect(isJsonValue(0)).toBe(true);
    expect(isJsonValue(42)).toBe(true);
    expect(isJsonValue(-3.14)).toBe(true);
  });

  it('rejects non-finite numbers', () => {
    expect(isJsonValue(Infinity)).toBe(false);
    expect(isJsonValue(-Infinity)).toBe(false);
    expect(isJsonValue(NaN)).toBe(false);
  });

  it('accepts plain objects with JSON-safe values', () => {
    expect(isJsonValue({ a: 1, b: 'x', c: null })).toBe(true);
    expect(isJsonValue({})).toBe(true);
  });

  it('rejects objects with non-JSON values', () => {
    expect(isJsonValue({ fn: () => {} })).toBe(false);
    expect(isJsonValue({ val: Infinity })).toBe(false);
    expect(isJsonValue({ nested: { val: undefined } })).toBe(false);
  });

  it('accepts arrays with JSON-safe values', () => {
    expect(isJsonValue([1, 'a', null, true])).toBe(true);
    expect(isJsonValue([])).toBe(true);
  });

  it('rejects arrays with non-JSON values', () => {
    expect(isJsonValue([undefined])).toBe(false);
    expect(isJsonValue([Infinity])).toBe(false);
  });

  it('rejects undefined and functions', () => {
    expect(isJsonValue(undefined)).toBe(false);
    expect(isJsonValue(() => {})).toBe(false);
  });
});

describe('toJsonValue', () => {
  it('returns the value when it is a valid JSON value', () => {
    expect(toJsonValue('hello')).toBe('hello');
    expect(toJsonValue(42)).toBe(42);
    expect(toJsonValue(null)).toBeNull();
    expect(toJsonValue({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns undefined for non-JSON values', () => {
    expect(toJsonValue(undefined)).toBeUndefined();
    expect(toJsonValue(Infinity)).toBeUndefined();
    expect(toJsonValue(() => {})).toBeUndefined();
  });
});

describe('toJsonObject', () => {
  it('returns the object for a plain JSON-safe object', () => {
    const obj = { x: 1, y: 'z' };
    expect(toJsonObject(obj)).toEqual(obj);
  });

  it('returns undefined for arrays', () => {
    expect(toJsonObject([1, 2])).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(toJsonObject(null)).toBeUndefined();
  });

  it('returns undefined for primitives', () => {
    expect(toJsonObject('string')).toBeUndefined();
    expect(toJsonObject(42)).toBeUndefined();
    expect(toJsonObject(true)).toBeUndefined();
  });

  it('returns undefined for objects with non-JSON values', () => {
    expect(toJsonObject({ fn: () => {} })).toBeUndefined();
  });
});
