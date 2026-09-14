'use strict';

/**
 * Test-global shim: exposes describe/test/expect (jest-style ergonomics)
 * on top of node:test + node:assert so the suite runs with plain `node --test`.
 */

const nodeTest = require('node:test');
const assert = require('node:assert');

globalThis.describe = globalThis.describe || nodeTest.describe;
globalThis.test = globalThis.test || nodeTest.test;

globalThis.expect = function expect(actual) {
  const handlers = {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toMatch(pattern) {
      assert.match(String(actual), typeof pattern === 'string' ? new RegExp(pattern) : pattern);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeGreaterThanOrEqual(expected) {
      assert.ok(Number(actual) >= expected, `expected ${actual} >= ${expected}`);
    },
    toBeGreaterThan(expected) {
      assert.ok(Number(actual) > expected, `expected ${actual} > ${expected}`);
    },
    toBeLessThan(expected) {
      assert.ok(Number(actual) < expected, `expected ${actual} < ${expected}`);
    },
    toContain(expected) {
      assert.ok(actual && typeof actual.includes === 'function' && actual.includes(expected), `expected to contain ${expected}`);
    },
  };
  const negated = {
    toBe(expected) {
      assert.notStrictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.notDeepStrictEqual(actual, expected);
    },
    toMatch(pattern) {
      assert.doesNotMatch(String(actual), typeof pattern === 'string' ? new RegExp(pattern) : pattern);
    },
    toBeTruthy() {
      assert.ok(!actual);
    },
    toContain(expected) {
      assert.ok(!actual || typeof actual.includes !== 'function' || !actual.includes(expected), `expected not to contain ${expected}`);
    },
  };
  return { ...handlers, not: negated };
};
