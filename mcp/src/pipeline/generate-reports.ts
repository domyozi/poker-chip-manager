import fs from 'node:fs';
import { getConfig } from '../config.js';
import { createToolContext } from '../tools/context.js';
import { createLogger } from '../util/logger.js';
import { bullet, h2 } from '../util/markdown.js';

function inLastDays(dateIso: string, days: number): boolean {
  const d = new Date(dateIso).getTime();
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return d >= threshold;
}

function priorityRank(labels: string[]): string {
  return labels.find((l) => l.startsWith('priority:')) || 'priority:P3';
}

async function run(): Promise<void> {
  const config = getConfig();
  const logger = createLogger(config.logDir);
  const ctx = createToolContext(config);
  const issues = await ctx.githubClient.listIssues();

  const done7d = issues.filter((i) => i.state === 'closed' && inLastDays(i.updatedAt, 7));
  const open = issues.filter((i) => i.state === 'open');

  const progressLines = [
    '# PROGRESS',
    '',
    h2('Last 7 Days Done'),
    ...done7d.map((i) => bullet(`#${i.number} ${i.title}`)),
    '',
    h2('Counts'),
    bullet(`Open: ${open.length}`),
    bullet(`Done (7d): ${done7d.length}`)
  ];

  const now = open.filter((i) => ['priority:P0', 'priority:P1'].includes(priorityRank(i.labels)));
  const next = open.filter((i) => priorityRank(i.labels) === 'priority:P2');
  const later = open.filter((i) => priorityRank(i.labels) === 'priority:P3');

  const roadmapLines = [
    '# ROADMAP',
    '',
    h2('Now'),
    ...(now.length ? now.map((i) => bullet(`#${i.number} ${i.title}`)) : [bullet('(none)')]),
    '',
    h2('Next'),
    ...(next.length ? next.map((i) => bullet(`#${i.number} ${i.title}`)) : [bullet('(none)')]),
    '',
    h2('Later'),
    ...(later.length ? later.map((i) => bullet(`#${i.number} ${i.title}`)) : [bullet('(none)')])
  ];

  fs.writeFileSync(config.progressPath, `${progressLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(config.roadmapPath, `${roadmapLines.join('\n')}\n`, 'utf8');

  logger.info('reports-generated', { progressPath: config.progressPath, roadmapPath: config.roadmapPath });
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
