import fs from 'node:fs';

export function readPackageVersion(packageJsonPath = 'package.json'): string {
  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  const pkgVersion = parsed.version?.trim();
  if (!pkgVersion) {
    throw new Error('package.json version is missing.');
  }
  return pkgVersion.startsWith('v') ? pkgVersion : `v${pkgVersion}`;
}

