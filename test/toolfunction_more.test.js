const assert = require('assert');
const path = require('path');
const loadBrowserFile = require('./helpers/loadBrowserFile');

describe('toolfunction helpers (more)', () => {
  const tfPath = path.join(__dirname, '..', 'bluelight', 'scripts', 'toolfunction.js');

  // Deterministic crypto for securePassword
  const fakeCrypto = {
    getRandomValues: (arr) => {
      const val = 0x7fffffff; // 2147483647
      arr[0] = val >>> 0;
      return arr;
    }
  };

  const ctx = loadBrowserFile(tfPath, { window: { crypto: fakeCrypto } });

  it('htmlEntities escapes and converts newlines', () => {
    const input = 'A & B <C> "Q"\nLine2';
    const escaped = ctx.htmlEntities(input);
    assert.strictEqual(escaped.includes('&amp;'), true);
    assert.strictEqual(escaped.includes('&lt;'), true);
    assert.strictEqual(escaped.includes('&gt;'), true);
    assert.strictEqual(escaped.includes('&quot;'), true);
    assert.strictEqual(escaped.includes('<br/>'), true);
  });

  it('splitArrayByElem groups by key', () => {
    const grouped = ctx.splitArrayByElem([
      { k: 'a', v: 1 },
      { k: 'b', v: 2 },
      { k: 'a', v: 3 }
    ], 'k');
    assert.ok(JSON.stringify(grouped['a'].map(x => x.v).sort()) === JSON.stringify([1, 3]));
    assert.ok(JSON.stringify(grouped['b'].map(x => x.v)) === JSON.stringify([2]));
  });

  it('soryByTwoKey sorts by nested keys', () => {
    const arr = [{ a: { b: 3 } }, { a: { b: 1 } }, { a: { b: 2 } }];
    const sorted = ctx.soryByTwoKey(arr, 'a', 'b');
    assert.deepStrictEqual(sorted.map(o => o.a.b), [1, 2, 3]);
  });

  it('securePassword stays within bounds and honors step', () => {
    for (const [min, max, step] of [[1, 10, 1], [5, 15, 5], [0, 1, 1]]) {
      const n = ctx.securePassword(min, max, step);
      assert.ok(n >= min && n <= max, 'securePassword out of bounds');
      assert.strictEqual((n - min) % step, 0);
    }
  });
});
