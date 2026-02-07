import fs from 'node:fs';
import { readPackageVersion } from './version-source.js';

const APP_VERSION_PATTERN = /const APP_VERSION = "(v[^"]*)";/;

function checkConsistency(appJsPath = 'js/app.js'): void {
  const expected = readPackageVersion();
  const raw = fs.readFileSync(appJsPath, 'utf8');
  const match = raw.match(APP_VERSION_PATTERN);
  if (!match) {
    throw new Error(`APP_VERSION declaration not found in ${appJsPath}.`);
  }
  const actual = match[1];
  if (actual !== expected) {
    throw new Error(
      `Version mismatch detected: package.json=${expected}, js/app.js=${actual}. Run "npm run version:sync".`
    );
  }
  console.log(JSON.stringify({ ok: true, expected, actual }, null, 2));
}

checkConsistency();

