import crypto from 'node:crypto';
import { FetchResult, XItem } from '../../types.js';
import { XClient } from './interface.js';

export class XApiClient implements XClient {
  constructor(
    private readonly bearerToken: string,
    private readonly userId?: string,
    private readonly oauth?: {
      apiKey?: string;
      apiKeySecret?: string;
      accessToken?: string;
      accessTokenSecret?: string;
    }
  ) {}

  private percentEncode(input: string): string {
    return encodeURIComponent(input).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  private buildOAuthHeader(method: string, url: string): string {
    const apiKey = this.oauth?.apiKey;
    const apiKeySecret = this.oauth?.apiKeySecret;
    const accessToken = this.oauth?.accessToken;
    const accessTokenSecret = this.oauth?.accessTokenSecret;
    if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
      throw new Error('Missing OAuth 1.0a credentials for X tweet posting.');
    }

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: apiKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: accessToken,
      oauth_version: '1.0'
    };

    const paramPairs = Object.entries(oauthParams)
      .map(([k, v]) => [this.percentEncode(k), this.percentEncode(v)] as const)
      .sort(([aKey, aVal], [bKey, bVal]) => (aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey)));
    const normalized = paramPairs.map(([k, v]) => `${k}=${v}`).join('&');

    const baseString = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(normalized)
    ].join('&');
    const signingKey = `${this.percentEncode(apiKeySecret)}&${this.percentEncode(accessTokenSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    const authHeaderParams = { ...oauthParams, oauth_signature: signature };
    const header = Object.entries(authHeaderParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${this.percentEncode(k)}="${this.percentEncode(v)}"`)
      .join(', ');
    return `OAuth ${header}`;
  }

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
      const body = await res.text().catch(() => '');
      const detail = body ? ` - ${body.slice(0, 400)}` : '';
      throw new Error(`X API request failed: ${res.status} ${res.statusText}${detail}`);
    }
    return (await res.json()) as T;
  }

  async postTweet(text: string): Promise<{ tweetId: string; url: string }> {
    type Resp = { data?: { id: string } };
    const body = JSON.stringify({ text });
    const url = 'https://api.x.com/2/tweets';
    const auth = this.buildOAuthHeader('POST', url);
    const json = await this.request<Resp>(url, {
      method: 'POST',
      body,
      headers: {
        Authorization: auth
      }
    });
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
