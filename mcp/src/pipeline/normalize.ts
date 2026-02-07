import crypto from 'node:crypto';
import { FeedbackEvent, XItem } from '../types.js';

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(source: string, text: string): string {
  const payload = `${source}:${normalizeText(text)}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function normalizeItems(source: 'mention' | 'reply' | 'quote', items: XItem[]): FeedbackEvent[] {
  return items.map((item) => ({
    id: `${source}:${item.id}`,
    source,
    tweetId: item.tweetId,
    parentTweetId: item.inReplyToTweetId || item.quotedTweetId,
    authorId: item.authorId,
    authorHandle: item.authorHandle,
    text: item.text.trim(),
    url: item.url,
    createdAt: item.createdAt,
    mediaUrls: item.mediaUrls || [],
    fingerprint: fingerprint(source, item.text)
  }));
}
