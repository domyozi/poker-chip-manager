import fs from 'node:fs';
import path from 'node:path';
import { FetchResult, XItem } from '../../types.js';
import { XClient } from './interface.js';

function makeItem(overrides: Partial<XItem>): XItem {
  const id = overrides.id || String(Date.now());
  return {
    id,
    tweetId: overrides.tweetId || id,
    authorId: overrides.authorId || 'mock-user',
    authorHandle: overrides.authorHandle || 'mock_user',
    text: overrides.text || 'Mock feedback',
    url: overrides.url || `https://x.com/mock/status/${id}`,
    createdAt: overrides.createdAt || new Date().toISOString(),
    mediaUrls: overrides.mediaUrls || []
  };
}

function loadFixture(fileName: string): XItem[] {
  const filePath = path.join('triage', fileName);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as XItem[];
  return parsed.map((i) => makeItem(i));
}

function filterSince(items: XItem[], sinceId?: string): XItem[] {
  if (!sinceId) return items;
  return items.filter((item) => Number(item.id) > Number(sinceId));
}

export class MockXClient implements XClient {
  async postTweet(text: string): Promise<{ tweetId: string; url: string }> {
    const tweetId = String(Date.now());
    return { tweetId, url: `https://x.com/mock/status/${tweetId}?text=${encodeURIComponent(text.slice(0, 20))}` };
  }

  async fetchMentions(sinceId?: string): Promise<FetchResult> {
    const items = filterSince(loadFixture('x_mentions.mock.json'), sinceId);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }

  async fetchReplies(tweetId: string, sinceId?: string): Promise<FetchResult> {
    const items = filterSince(loadFixture(`x_replies_${tweetId}.mock.json`), sinceId);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }

  async fetchQuoteTweets(tweetId: string, sinceId?: string): Promise<FetchResult> {
    const items = filterSince(loadFixture(`x_quotes_${tweetId}.mock.json`), sinceId);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }
}
