import { FetchResult } from '../../types.js';

export interface XClient {
  postTweet(text: string, mediaPaths?: string[]): Promise<{ tweetId: string; url: string }>;
  fetchMentions(sinceId?: string): Promise<FetchResult>;
  fetchReplies(tweetId: string, sinceId?: string): Promise<FetchResult>;
  fetchQuoteTweets(tweetId: string, sinceId?: string): Promise<FetchResult>;
}
