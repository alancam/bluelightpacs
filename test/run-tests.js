/* Minimal test runner: discovers *.test.js in this folder and runs them. */
const fs = require('fs');
const path = require('path');

async function run() {
  const testDir = __dirname;
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const full = path.join(testDir, file);
    process.stdout.write(`Running ${file} ... `);
    try {
      const mod = require(full);
      if (typeof mod === 'function') {
        await mod();
      } else if (mod && typeof mod.run === 'function') {
        await mod.run();
      }
      console.log('OK');
      passed++;
    } catch (err) {
      console.log('FAIL');
      console.error(err && err.stack ? err.stack : err);
      failed++;
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();

