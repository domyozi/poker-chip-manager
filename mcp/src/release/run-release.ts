import fs from 'node:fs';
import { getConfig } from '../config.js';
import { createLogger } from '../util/logger.js';
import { loadState, saveState } from '../tools/state-tools.js';
import { summarizeRelease } from './summarize-release.js';
import { createToolContext } from '../tools/context.js';
import { readPackageVersion } from './version-source.js';

function parseVersion(): string {
  const i = process.argv.indexOf('--version');
  if (i < 0 || !process.argv[i + 1]) return readPackageVersion();
  return process.argv[i + 1];
}

function appendAnnouncement(changelogPath: string, version: string, url: string): void {
  if (!fs.existsSync(changelogPath)) return;
  const raw = fs.readFileSync(changelogPath, 'utf8');
  const marker = `## ${version}`;
  const idx = raw.indexOf(marker);
  if (idx < 0) return;

  const insertAt = raw.indexOf('\n', idx + marker.length);
  if (insertAt < 0) return;
  const line = `\n- Announced on X: ${url}`;
  if (raw.includes(line.trim())) return;
  const updated = `${raw.slice(0, insertAt)}${line}${raw.slice(insertAt)}`;
  fs.writeFileSync(changelogPath, updated, 'utf8');
}

async function run(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logDir);
  const ctx = createToolContext(config);
  const state = loadState(config.statePath);
  const version = parseVersion();
  const release = summarizeRelease(config.changelogPath, version);

  const text = `${release.summary} #PocketPot`;
  let tweetId = `dry-${Date.now()}`;
  let url = `dry-run://x/${tweetId}`;

  if (config.apply) {
    const posted = await ctx.xClient.postTweet(text);
    tweetId = posted.tweetId;
    url = posted.url;
    appendAnnouncement(config.changelogPath, version, url);
  }

  state.x.lastReleaseTweetId = tweetId;
  state.x.lastReleaseTweetUrl = url;
  state.runHistory.push({
    at: new Date().toISOString(),
    mode: 'release',
    dryRun: config.dryRun,
    summary: { version, tweetId, url }
  });
  saveState(config.statePath, state);

  logger.info('release-finished', { version, tweetId, url, dryRun: config.dryRun });

  console.log(JSON.stringify({ version, tweetId, url, dryRun: config.dryRun }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
