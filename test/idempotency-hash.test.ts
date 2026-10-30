import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, hashRequest } from '../src/http/idempotency.js';

describe('hash de petición para idempotencia', () => {
  it('es sha256 hex del JSON canónico', () => {
    const expected = createHash('sha256').update('{"a":1,"b":"x"}').digest('hex');
    expect(hashRequest({ b: 'x', a: 1 })).toBe(expected);
    expect(hashRequest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no depende del orden de las claves, también en objetos anidados', () => {
    expect(hashRequest({ a: 1, b: { y: 2, x: [1, { q: 1, p: 2 }] } })).toBe(
      hashRequest({ b: { x: [1, { p: 2, q: 1 }], y: 2 }, a: 1 }),
    );
  });

  it('cambia si cambia un valor o el orden de un array', () => {
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    expect(hashRequest({ a: [1, 2] })).not.toBe(hashRequest({ a: [2, 1] }));
    expect(hashRequest({ a: '1' })).not.toBe(hashRequest({ a: 1 }));
  });

  it('ignora claves undefined como JSON.stringify', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson([undefined])).toBe('[null]');
    expect(canonicalJson(null)).toBe('null');
  });
});
