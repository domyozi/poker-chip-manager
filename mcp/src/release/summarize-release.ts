import fs from 'node:fs';

export function summarizeRelease(changelogPath: string, version: string): { summary: string; section: string } {
  if (!fs.existsSync(changelogPath)) {
    return {
      summary: `Pocket Pot ${version} をリリースしました。改善点をぜひ試してください。`,
      section: ''
    };
  }

  const raw = fs.readFileSync(changelogPath, 'utf8');
  const marker = `## ${version}`;
  const idx = raw.indexOf(marker);
  if (idx < 0) {
    return {
      summary: `Pocket Pot ${version} をリリースしました。詳細はCHANGELOGをご確認ください。`,
      section: ''
    };
  }

  const rest = raw.slice(idx + marker.length);
  const nextIdx = rest.search(/\n##\s+/);
  const section = (nextIdx >= 0 ? rest.slice(0, nextIdx) : rest).trim();
  const bullets = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .slice(0, 3)
    .map((l) => l.replace(/^-\s*/, ''));

  const summary = [`Pocket Pot ${version} リリース`, ...bullets].join(' / ');
  return { summary, section };
}
