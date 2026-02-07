import { z } from 'zod';
import { ToolContext } from './context.js';
import { withRetry } from '../util/retry.js';
import { RateLimiter } from '../util/rate-limit.js';

const limiter = new RateLimiter(250);

const postTweetSchema = z.object({
  text: z.string().min(1),
  mediaPaths: z.array(z.string()).optional()
});

const fetchSchema = z.object({
  sinceId: z.string().optional()
});

const fetchRepliesSchema = z.object({
  tweetId: z.string().min(1),
  sinceId: z.string().optional()
});

export async function postTweetTool(ctx: ToolContext, input: unknown): Promise<{ tweetId: string; url: string; dryRun: boolean }> {
  const { text, mediaPaths } = postTweetSchema.parse(input);
  if (ctx.config.dryRun) {
    const fakeId = String(Date.now());
    return { tweetId: fakeId, url: `https://x.com/mock/status/${fakeId}`, dryRun: true };
  }
  await limiter.take();
  const result = await withRetry(() => ctx.xClient.postTweet(text, mediaPaths));
  return { ...result, dryRun: false };
}

export async function fetchMentionsTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const { sinceId } = fetchSchema.parse(input);
  await limiter.take();
  return withRetry(() => ctx.xClient.fetchMentions(sinceId));
}

export async function fetchRepliesTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const { tweetId, sinceId } = fetchRepliesSchema.parse(input);
  await limiter.take();
  return withRetry(() => ctx.xClient.fetchReplies(tweetId, sinceId));
}

export async function fetchQuoteTweetsTool(ctx: ToolContext, input: unknown): Promise<unknown> {
  const { tweetId, sinceId } = fetchRepliesSchema.parse(input);
  await limiter.take();
  return withRetry(() => ctx.xClient.fetchQuoteTweets(tweetId, sinceId));
}
