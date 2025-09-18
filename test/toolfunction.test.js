const assert = require('assert');
const path = require('path');
const loadBrowserFile = require('./helpers/loadBrowserFile');

describe('toolfunction helpers', () => {
  const tfPath = path.join(__dirname, '..', 'bluelight', 'scripts', 'toolfunction.js');
  const ctx = loadBrowserFile(tfPath);

  it('equal_TOL respects tolerance', () => {
    assert.strictEqual(ctx.equal_TOL(10, 10.5, 1), true);
    assert.strictEqual(ctx.equal_TOL(10, 12.1, 1), false);
  });

  it('SortArrayByElem sorts by numeric key', () => {
    const arr1 = [{ x: 3 }, { x: 1 }, { x: 2 }];
    const sorted1 = ctx.SortArrayByElem(arr1, 'x');
    assert.deepStrictEqual(sorted1.map(o => o.x), [1, 2, 3]);
  });

  it('soryByKey sorts by top-level key', () => {
    const arr2 = [{ a: 9 }, { a: -1 }, { a: 4 }];
    const sorted2 = ctx.soryByKey(arr2, 'a');
    assert.deepStrictEqual(sorted2.map(o => o.a), [-1, 4, 9]);
  });

  it('getDistance computes Euclidean distance', () => {
    assert.strictEqual(ctx.getDistance(3, 4), 5);
  });
});
