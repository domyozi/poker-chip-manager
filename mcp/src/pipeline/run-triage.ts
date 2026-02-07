import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { createToolContext } from '../tools/context.js';
import { createLogger } from '../util/logger.js';
import { loadState, saveState } from '../tools/state-tools.js';
import { normalizeItems } from './normalize.js';
import { dedupeEvents } from './dedupe.js';
import { triageWithLLM } from './llm-triage.js';
import { applyConfirm, ensureConfirmTemplate, loadConfirmFile } from './confirm.js';
import { createIssuesFromCandidates, ensureGitHubBase } from './github-sync.js';
import { IssueCandidate } from '../types.js';

function toInboxMd(candidates: IssueCandidate[]): string {
  const lines: string[] = ['# Triage Inbox', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const c of candidates) {
    lines.push(`## ${c.candidateId} [${c.priority}] ${c.title}`);
    lines.push(`- repeated: ${c.repeatedCount}`);
    lines.push(`- media: ${c.mediaCount}`);
    lines.push(`- auto-create: ${c.shouldAutoCreate}`);
    lines.push(...c.evidence.map((u) => `- ref: ${u}`));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function run(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logDir);
  const ctx = createToolContext(config);
  const state = loadState(config.statePath);

  logger.info('triage-start', { dryRun: config.dryRun, sinceId: state.x.sinceId });

  const mentions = await ctx.xClient.fetchMentions(state.x.sinceId);
  const replies = state.x.lastReleaseTweetId
    ? await ctx.xClient.fetchReplies(state.x.lastReleaseTweetId, state.x.sinceId)
    : { items: [], nextSinceId: state.x.sinceId };
  const quotes = state.x.lastReleaseTweetId
    ? await ctx.xClient.fetchQuoteTweets(state.x.lastReleaseTweetId, state.x.sinceId)
    : { items: [], nextSinceId: state.x.sinceId };

  const events = [
    ...normalizeItems('mention', mentions.items),
    ...normalizeItems('reply', replies.items),
    ...normalizeItems('quote', quotes.items)
  ];

  const clusters = dedupeEvents(events);
  const candidates = await triageWithLLM(clusters);

  fs.mkdirSync(path.dirname(config.triageInboxJsonPath), { recursive: true });
  fs.writeFileSync(config.triageInboxJsonPath, JSON.stringify(candidates, null, 2));
  fs.writeFileSync(config.triageInboxMdPath, toInboxMd(candidates));

  ensureConfirmTemplate(config.triageConfirmPath);
  const confirm = loadConfirmFile(config.triageConfirmPath);
  const selected = applyConfirm(candidates, confirm);

  const shouldCreate = selected.filter((c) => config.autoCreateStrict ? (c.shouldAutoCreate || confirm.approve.some((a) => a.candidateId === c.candidateId)) : confirm.approve.some((a) => a.candidateId === c.candidateId));

  const project = await ensureGitHubBase(ctx.githubClient, config.github.projectName);
  state.github.projectId = project.projectId;

  let created: Array<{ candidateId: string; issueNumber: number; url: string }> = [];
  if (config.apply) {
    created = await createIssuesFromCandidates(ctx.githubClient, project.projectId, shouldCreate);
  }

  state.x.sinceId = [mentions.nextSinceId, replies.nextSinceId, quotes.nextSinceId].filter(Boolean).sort().at(-1);
  state.triage.lastRunAt = new Date().toISOString();
  state.runHistory.push({
    at: new Date().toISOString(),
    mode: 'triage',
    dryRun: config.dryRun,
    summary: {
      fetched: events.length,
      clusters: clusters.length,
      candidates: candidates.length,
      selected: shouldCreate.length,
      created: created.length
    }
  });

  saveState(config.statePath, state);

  logger.info('triage-finished', {
    fetched: events.length,
    candidates: candidates.length,
    selected: shouldCreate.length,
    created: created.length
  });

  console.log(JSON.stringify({
    fetched: events.length,
    clusters: clusters.length,
    candidates: candidates.length,
    selected: shouldCreate.length,
    created,
    dryRun: config.dryRun
  }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
