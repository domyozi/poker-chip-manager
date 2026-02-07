import fs from 'node:fs';
import { readPackageVersion } from './version-source.js';

const APP_VERSION_PATTERN = /const APP_VERSION = "v[^"]*";/;

function syncAppVersion(appJsPath = 'js/app.js'): void {
  const version = readPackageVersion();
  const raw = fs.readFileSync(appJsPath, 'utf8');
  if (!APP_VERSION_PATTERN.test(raw)) {
    throw new Error(`APP_VERSION declaration not found in ${appJsPath}.`);
  }
  const updated = raw.replace(APP_VERSION_PATTERN, `const APP_VERSION = "${version}";`);
  fs.writeFileSync(appJsPath, updated, 'utf8');
  console.log(JSON.stringify({ synced: true, appJsPath, version }, null, 2));
}

syncAppVersion();

