#!/usr/bin/env node
// Node-based index builder for server-side caching
// Usage:
//   node tools/build-dicom-index.js --dir ./dicoms --base /dicoms/ --out ./dicoms.index.json

const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dir: './dicoms', base: '/dicoms/', out: './dicoms.index.json', splitDir: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dir') out.dir = args[++i];
    else if (a === '--base') out.base = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--splitDir') out.splitDir = args[++i];
  }
  if (!out.base.endsWith('/')) out.base += '/';
  out.dir = path.resolve(out.dir);
  out.out = path.resolve(out.out);
  if (out.splitDir) out.splitDir = path.resolve(out.splitDir);
  return out;
}

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full));
    else files.push(full);
  }
  return files;
}

function isLikelyDicom(buf) {
  if (!buf || buf.length < 132) return false;
  return buf.toString('ascii', 128, 132) === 'DICM';
}

function get(ds, tag) { try { return ds.string(tag) || ''; } catch { return ''; } }
function getInt(ds, tag) { try { return ds.intString(tag) || 0; } catch { return 0; } }

function toUrl(base, rootDir, filePath) {
  const rel = path.relative(rootDir, filePath).split(path.sep).map(encodeURIComponent).join('/');
  return base + rel;
}

function buildIndex(allFiles, rootDir, base) {
  const patients = {};
  let count = 0;
  for (const f of allFiles) {
    try {
      const buf = fs.readFileSync(f);
      // Try to parse even if magic missing; some DICOMs omit DICM.
      const byteArray = new Uint8Array(buf);
      const ds = dicomParser.parseDicom(byteArray);
      const patientId = get(ds, 'x00100020');
      const patientName = get(ds, 'x00100010');
      const studyUID = get(ds, 'x0020000d');
      const seriesUID = get(ds, 'x0020000e');
      const sopUID = get(ds, 'x00080018');
      if (!studyUID || !seriesUID || !sopUID) continue;
      const instNum = getInt(ds, 'x00200013');
      const numberOfFrames = getInt(ds, 'x00280008');
      const studyDate = get(ds, 'x00080020');
      const studyDesc = get(ds, 'x00081030');
      const seriesDesc = get(ds, 'x0008103e');
      const url = toUrl(base, rootDir, f);

      const p = patients[patientId] || (patients[patientId] = { patientId, patientName, studies: {} });
      const s = p.studies[studyUID] || (p.studies[studyUID] = { studyUID, studyDate, studyDesc, series: {} });
      const se = s.series[seriesUID] || (s.series[seriesUID] = { seriesUID, seriesDesc, instances: [] });
      se.instances.push({ url, sopUID, instNum, numberOfFrames });
      count++;
    } catch { /* skip non-dicom */ }
  }
  // Sort instances by InstanceNumber
  for (const pid of Object.keys(patients)) {
    for (const stUID of Object.keys(patients[pid].studies)) {
      for (const seUID of Object.keys(patients[pid].studies[stUID].series)) {
        patients[pid].studies[stUID].series[seUID].instances.sort((a, b) => (a.instNum||0) - (b.instNum||0));
      }
    }
  }
  return { createdAt: Date.now(), base, patients, count };
}

async function main() {
  const { dir, base, out, splitDir } = parseArgs();
  if (!fs.existsSync(dir)) {
    console.error('Directory not found:', dir);
    process.exit(1);
  }
  const files = walk(dir);
  const index = buildIndex(files, dir, base);
  fs.writeFileSync(out, JSON.stringify(index));
  console.log('Indexed', index.count, 'instances from', files.length, 'files');
  console.log('Wrote', out);

  if (splitDir) {
    const patientsDir = path.join(splitDir, 'patients');
    fs.mkdirSync(patientsDir, { recursive: true });
    // Build manifest and per-patient JSON
    const manifest = { base, createdAt: index.createdAt, patients: [] };
    for (const pid of Object.keys(index.patients)) {
      const p = index.patients[pid];
      manifest.patients.push({ patientId: p.patientId, patientName: p.patientName });
      const pFile = path.join(patientsDir, encodeURIComponent(pid) + '.json');
      const pJson = { base, patientId: p.patientId, patientName: p.patientName, studies: p.studies };
      fs.writeFileSync(pFile, JSON.stringify(pJson));
    }
    fs.writeFileSync(path.join(splitDir, 'manifest.json'), JSON.stringify(manifest));
    console.log('Wrote split index to', splitDir);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
