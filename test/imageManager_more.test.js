const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadCtx() {
  const sandbox = {
    console,
    window: {},
    document: {},
    TAG_DICT: {},
    onloadFunction: { push2First: () => {}, push2Last: () => {} },
  };
  const context = vm.createContext(sandbox);
  const tfCode = fs.readFileSync(path.join(__dirname, '..', 'bluelight', 'scripts', 'toolfunction.js'), 'utf8');
  vm.runInContext(tfCode, context, { filename: 'toolfunction.js' });
  const patientCode = fs.readFileSync(path.join(__dirname, '..', 'bluelight', 'scripts', 'patient.js'), 'utf8');
  vm.runInContext(patientCode, context, { filename: 'patient.js' });
  return context;
}

describe('BlueLightImageManager edge cases', () => {
  it('ignores duplicate SOPs', () => {
    const ctx = loadCtx();
    const Manager = vm.runInContext('BlueLightImageManager', ctx);
    const mgr = new Manager();

    const base = { StudyInstanceUID: 's1', SeriesInstanceUID: 'r1', SOPInstanceUID: 'x1', InstanceNumber: 1, data: { string: () => '' } };
    mgr.pushStudy({ ...base });
    mgr.pushStudy({ ...base }); // duplicate

    assert.strictEqual(mgr.Study.length, 1);
    assert.strictEqual(mgr.Study[0].Series.length, 1);
    assert.strictEqual(mgr.Study[0].Series[0].Sop.length, 1);
  });

  it('handles multiple studies and series, and flags same InstanceNumber', () => {
    const ctx = loadCtx();
    const Manager = vm.runInContext('BlueLightImageManager', ctx);
    const mgr = new Manager();

    function make(Study, Series, Sop, num) {
      return { StudyInstanceUID: Study, SeriesInstanceUID: Series, SOPInstanceUID: Sop, InstanceNumber: num, data: { string: () => '' } };
    }

    // Study 1, Series A
    mgr.pushStudy(make('stu1', 'A', 'a1', 1));
    mgr.pushStudy(make('stu1', 'A', 'a2', 1)); // same InstanceNumber
    // Study 1, Series B
    mgr.pushStudy(make('stu1', 'B', 'b1', 5));
    // Study 2, Series A
    mgr.pushStudy(make('stu2', 'A', 'c1', 2));

    assert.strictEqual(mgr.Study.length >= 2, true);
    const s1 = mgr.findStudy('stu1');
    const s2 = mgr.findStudy('stu2');
    assert.ok(s1 && s2);

    const seriesA = mgr.findSeries('A');
    const seriesB = mgr.findSeries('B');
    assert.ok(seriesA && seriesB);

    // same InstanceNumber across two SOPs in series A should set haveSameInstanceNumber
    const aSops = seriesA.Sop;
    // Series map is global by SeriesInstanceUID; both studies with Series 'A' merge here
    assert.strictEqual(aSops.length, 3);
    // Current implementation flags all images when any duplicate InstanceNumber exists in series
    assert.ok(aSops.every(s => s.Image.haveSameInstanceNumber === true));
  });
});
