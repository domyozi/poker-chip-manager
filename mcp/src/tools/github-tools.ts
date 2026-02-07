import { z } from 'zod';
import { ToolContext } from './context.js';
import { withRetry } from '../util/retry.js';
import { RateLimiter } from '../util/rate-limit.js';

const limiter = new RateLimiter(250);

const createIssueSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(''),
  labels: z.array(z.string()).default([])
});

const updateIssueSchema = z.object({
  issueNumber: z.number().int().positive(),
  title: z.string().optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional()
});

const commentSchema = z.object({
  issueNumber: z.number().int().positive(),
  body: z.string().min(1)
});

const labelsSchema = z.object({
  labels: z.array(z.object({
    name: z.string(),
    color: z.string(),
    description: z.string()
  }))
});

const ensureProjectSchema = z.object({
  name: z.string(),
  columns: z.array(z.string())
});

const projectItemSchema = z.object({
  issueNumber: z.number().int().positive(),
  projectId: z.string(),
  column: z.string()
});

export async function createIssueTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const parsed = createIssueSchema.parse(input);
  if (ctx.config.dryRun) {
    return { issueNumber: 0, url: 'dry-run://issue/create', dryRun: true, payload: parsed };
  }
  await limiter.take();
  return withRetry(() => ctx.githubClient.createIssue(parsed));
}

export async function updateIssueTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const parsed = updateIssueSchema.parse(input);
  if (ctx.config.dryRun) {
    return { url: 'dry-run://issue/update', dryRun: true, payload: parsed };
  }
  await limiter.take();
  return withRetry(() => ctx.githubClient.updateIssue(parsed));
}

export async function addIssueCommentTool(ctx: ToolContext, input: unknown): Promise<{ ok: boolean; dryRun: boolean }> {
  const parsed = commentSchema.parse(input);
  if (ctx.config.dryRun) {
    return { ok: true, dryRun: true };
  }
  await limiter.take();
  await withRetry(() => ctx.githubClient.addIssueComment(parsed.issueNumber, parsed.body));
  return { ok: true, dryRun: false };
}

export async function ensureLabelsTool(ctx: ToolContext, input: unknown): Promise<{ ok: boolean; dryRun: boolean }> {
  const parsed = labelsSchema.parse(input);
  if (ctx.config.dryRun) {
    return { ok: true, dryRun: true };
  }
  await limiter.take();
  await withRetry(() => ctx.githubClient.ensureLabels(parsed.labels));
  return { ok: true, dryRun: false };
}

export async function ensureProjectTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const parsed = ensureProjectSchema.parse(input);
  if (ctx.config.dryRun) {
    return { projectId: 'dry-run-project', dryRun: true };
  }
  await limiter.take();
  return withRetry(() => ctx.githubClient.ensureProject(parsed.name, parsed.columns));
}

export async function addIssueToProjectTool(ctx: ToolContext, input: unknown): Promise<{ ok: boolean; dryRun: boolean }> {
  const parsed = projectItemSchema.parse(input);
  if (ctx.config.dryRun) return { ok: true, dryRun: true };
  await limiter.take();
  await withRetry(() => ctx.githubClient.addIssueToProject(parsed.issueNumber, parsed.projectId, parsed.column));
  return { ok: true, dryRun: false };
}

export async function moveProjectItemTool(ctx: ToolContext, input: unknown): Promise<{ ok: boolean; dryRun: boolean }> {
  const parsed = projectItemSchema.parse(input);
  if (ctx.config.dryRun) return { ok: true, dryRun: true };
  await limiter.take();
  await withRetry(() => ctx.githubClient.moveProjectItem(parsed.issueNumber, parsed.projectId, parsed.column));
  return { ok: true, dryRun: false };
}
