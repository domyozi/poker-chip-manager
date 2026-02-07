import { classifyPriority, shouldAutoCreateStrict } from './classify.js';
import { FeedbackCluster } from './dedupe.js';
import { IssueCandidate } from '../types.js';

function extractReproSteps(text: string): string[] {
  const lines = text.split(/\n|。/).map((l) => l.trim()).filter(Boolean);
  return lines.filter((line) => /^\d+[\).]/.test(line) || /手順|再現/.test(line)).slice(0, 5);
}

function buildTitle(cluster: FeedbackCluster): string {
  const head = cluster.events[0]?.text || 'X feedback';
  const short = head.replace(/\s+/g, ' ').slice(0, 48);
  return `[X][${cluster.key}] ${short}`;
}

function buildBody(cluster: FeedbackCluster, priority: string, repro: string[]): string {
  const reporters = [...new Set(cluster.events.map((e) => `@${e.authorHandle}`))];
  const refs = cluster.events.map((e) => `- ${e.url}`).join('\n');
  const reproMd = repro.length ? repro.map((r) => `- ${r}`).join('\n') : '- (未特定)';
  return [
    `Source: X feedback cluster ${cluster.key}`,
    `Priority: ${priority}`,
    '',
    'Reporters:',
    ...reporters.map((r) => `- ${r}`),
    '',
    'Repro steps:',
    reproMd,
    '',
    'References:',
    refs
  ].join('\n');
}

export async function triageWithLLM(clusters: FeedbackCluster[]): Promise<IssueCandidate[]> {
  return clusters.map((cluster, idx) => {
    const mergedText = cluster.events.map((e) => e.text).join('\n');
    const priority = classifyPriority(mergedText);
    const reproSteps = extractReproSteps(mergedText);
    const reporters = [...new Set(cluster.events.map((e) => e.authorId))];
    const mediaCount = cluster.events.reduce((sum, e) => sum + (e.mediaUrls?.length || 0), 0);

    return {
      candidateId: `cand-${idx + 1}-${cluster.key}`,
      title: buildTitle(cluster),
      body: buildBody(cluster, priority, reproSteps),
      priority,
      confidence: 0.7,
      evidence: cluster.events.map((e) => e.url),
      reproSteps: reproSteps.length ? reproSteps : undefined,
      reporters,
      repeatedCount: cluster.events.length,
      mediaCount,
      shouldAutoCreate: shouldAutoCreateStrict({
        priority,
        hasReproSteps: reproSteps.length > 0,
        mediaCount,
        uniqueReporterCount: reporters.length
      }),
      sourceEventIds: cluster.events.map((e) => e.id)
    };
  });
}
