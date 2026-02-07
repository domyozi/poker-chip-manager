import readline from 'node:readline';
import { getConfig } from './config.js';
import { createLogger } from './util/logger.js';
import { createToolContext } from './tools/context.js';
import { loadState, saveState } from './tools/state-tools.js';
import {
  postTweetTool,
  fetchMentionsTool,
  fetchRepliesTool,
  fetchQuoteTweetsTool
} from './tools/x-tools.js';
import {
  createIssueTool,
  updateIssueTool,
  addIssueCommentTool,
  ensureLabelsTool,
  ensureProjectTool,
  addIssueToProjectTool,
  moveProjectItemTool
} from './tools/github-tools.js';

const config = getConfig();
const logger = createLogger(config.logDir);
const ctx = createToolContext(config);

type ToolHandler = (input: unknown) => Promise<unknown>;

const tools: Record<string, ToolHandler> = {
  postTweet: (input) => postTweetTool(ctx, input),
  fetchMentions: (input) => fetchMentionsTool(ctx, input),
  fetchReplies: (input) => fetchRepliesTool(ctx, input),
  fetchQuoteTweets: (input) => fetchQuoteTweetsTool(ctx, input),
  createIssue: (input) => createIssueTool(ctx, input),
  updateIssue: (input) => updateIssueTool(ctx, input),
  addIssueComment: (input) => addIssueCommentTool(ctx, input),
  ensureLabels: (input) => ensureLabelsTool(ctx, input),
  ensureProject: (input) => ensureProjectTool(ctx, input),
  addIssueToProject: (input) => addIssueToProjectTool(ctx, input),
  moveProjectItem: (input) => moveProjectItemTool(ctx, input),
  loadState: async () => loadState(config.statePath),
  saveState: async (input) => {
    saveState(config.statePath, input as any);
    return { ok: true };
  }
};

logger.info('mcp-server-started', { dryRun: config.dryRun, tools: Object.keys(tools) });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line) as { id?: string | number; tool: string; input?: unknown };
    const handler = tools[msg.tool];
    if (!handler) {
      process.stdout.write(`${JSON.stringify({ id: msg.id, error: `Unknown tool: ${msg.tool}` })}\n`);
      return;
    }
    const result = await handler(msg.input);
    process.stdout.write(`${JSON.stringify({ id: msg.id, result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: (error as Error).message })}\n`);
    logger.error('mcp-server-error', { error: (error as Error).message });
  }
});
