import { FetchResult, XItem } from '../../types.js';
import { XClient } from './interface.js';

export class XApiClient implements XClient {
  constructor(private readonly bearerToken: string, private readonly userId?: string) {}

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    });
    if (!res.ok) {
      throw new Error(`X API request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async postTweet(text: string): Promise<{ tweetId: string; url: string }> {
    type Resp = { data?: { id: string } };
    const body = JSON.stringify({ text });
    const json = await this.request<Resp>('https://api.x.com/2/tweets', { method: 'POST', body });
    const tweetId = json.data?.id || String(Date.now());
    return { tweetId, url: `https://x.com/i/web/status/${tweetId}` };
  }

  private normalizeItems(raw: any[]): XItem[] {
    return raw.map((item) => ({
      id: item.id,
      tweetId: item.id,
      authorId: item.author_id || 'unknown',
      authorHandle: item.author_id || 'unknown',
      text: item.text || '',
      url: `https://x.com/i/web/status/${item.id}`,
      createdAt: item.created_at || new Date().toISOString(),
      inReplyToTweetId: item.in_reply_to_user_id,
      mediaUrls: []
    }));
  }

  async fetchMentions(sinceId?: string): Promise<FetchResult> {
    if (!this.userId) throw new Error('X user ID is required for mentions fetch.');
    const q = sinceId ? `?since_id=${sinceId}&tweet.fields=created_at,author_id` : '?tweet.fields=created_at,author_id';
    const url = `https://api.x.com/2/users/${this.userId}/mentions${q}`;
    const json = await this.request<{ data?: any[] }>(url);
    const items = this.normalizeItems(json.data || []);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }

  async fetchReplies(tweetId: string, sinceId?: string): Promise<FetchResult> {
    const query = encodeURIComponent(`conversation_id:${tweetId} is:reply`);
    const q = sinceId
      ? `?query=${query}&since_id=${sinceId}&tweet.fields=created_at,author_id`
      : `?query=${query}&tweet.fields=created_at,author_id`;
    const json = await this.request<{ data?: any[] }>(`https://api.x.com/2/tweets/search/recent${q}`);
    const items = this.normalizeItems(json.data || []);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }

  async fetchQuoteTweets(tweetId: string, sinceId?: string): Promise<FetchResult> {
    const q = sinceId ? `?since_id=${sinceId}&tweet.fields=created_at,author_id` : '?tweet.fields=created_at,author_id';
    const json = await this.request<{ data?: any[] }>(`https://api.x.com/2/tweets/${tweetId}/quote_tweets${q}`);
    const items = this.normalizeItems(json.data || []);
    return { items, nextSinceId: items.at(-1)?.id || sinceId };
  }
}
