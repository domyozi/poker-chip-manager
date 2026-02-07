import { XClient } from '../../src/adapters/x/interface.js';
import { FetchResult } from '../../src/types.js';

export class TestXMock implements XClient {
  constructor(private readonly result: FetchResult = { items: [] }) {}

  async postTweet(): Promise<{ tweetId: string; url: string }> {
    return { tweetId: '1', url: 'https://x.com/mock/status/1' };
  }

  async fetchMentions(): Promise<FetchResult> {
    return this.result;
  }

  async fetchReplies(): Promise<FetchResult> {
    return this.result;
  }

  async fetchQuoteTweets(): Promise<FetchResult> {
    return this.result;
  }
}
