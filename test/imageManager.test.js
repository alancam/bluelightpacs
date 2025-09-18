const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Load toolfunction.js and patient.js into a shared VM context, with minimal globals
function loadImageManagerContext() {
  const sandbox = {
    console,
    window: {},
    document: {},
    // Stub TAG_DICT and onloadFunction to avoid side effects in patient.js
    TAG_DICT: {},
    onloadFunction: {
      push2First: () => {},
      push2Last: () => {},
    },
  };
  const context = vm.createContext(sandbox);

  const tfCode = fs.readFileSync(path.join(__dirname, '..', 'bluelight', 'scripts', 'toolfunction.js'), 'utf8');
  vm.runInContext(tfCode, context, { filename: 'toolfunction.js' });

  const patientCode = fs.readFileSync(path.join(__dirname, '..', 'bluelight', 'scripts', 'patient.js'), 'utf8');
  vm.runInContext(patientCode, context, { filename: 'patient.js' });

  return context;
}

describe('BlueLightImageManager basics', () => {
  it('groups by Study/Series and sorts by InstanceNumber', () => {
    const ctx = loadImageManagerContext();
    const ManagerCtor = vm.runInContext('BlueLightImageManager', ctx);
    const mgr = new ManagerCtor();

    function makeImage(Study, Series, Sop, InstanceNumber) {
      return {
        StudyInstanceUID: Study,
        SeriesInstanceUID: Series,
        SOPInstanceUID: Sop,
        InstanceNumber,
        data: { string: () => '' }
      };
    }

    const img2 = makeImage('stu1', 'ser1', 'sop2', 2);
    const img1 = makeImage('stu1', 'ser1', 'sop1', 1);
    const img3 = makeImage('stu1', 'ser1', 'sop3', 3);

    mgr.pushStudy(img2);
    mgr.pushStudy(img1);
    mgr.pushStudy(img3);

    // Validate structure
    assert.strictEqual(mgr.Study.length, 1);
    assert.strictEqual(mgr.Study[0].Series.length, 1);
    const sopList = mgr.Study[0].Series[0].Sop;
    assert.strictEqual(sopList.length, 3);
    // Sorted by InstanceNumber ascending
    const uids = sopList.map(s => s.SOPInstanceUID);
    assert.ok(JSON.stringify(uids) === JSON.stringify(['sop1', 'sop2', 'sop3']));

    // findSeries and findSop
    const series = mgr.findSeries('ser1');
    assert.ok(series && series.SeriesInstanceUID === 'ser1');
    const sop2 = mgr.findSop('sop2');
    assert.ok(sop2 && sop2.SOPInstanceUID === 'sop2');
  });
});
