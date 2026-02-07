export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface XItem {
  id: string;
  tweetId: string;
  authorId: string;
  authorHandle: string;
  text: string;
  url: string;
  createdAt: string;
  inReplyToTweetId?: string;
  quotedTweetId?: string;
  mediaUrls?: string[];
}

export interface FetchResult {
  items: XItem[];
  nextSinceId?: string;
}

export interface FeedbackEvent {
  id: string;
  source: 'mention' | 'reply' | 'quote';
  tweetId: string;
  parentTweetId?: string;
  authorId: string;
  authorHandle: string;
  text: string;
  url: string;
  createdAt: string;
  mediaUrls: string[];
  fingerprint: string;
}

export interface IssueCandidate {
  candidateId: string;
  title: string;
  body: string;
  priority: Priority;
  confidence: number;
  evidence: string[];
  reproSteps?: string[];
  reporters: string[];
  repeatedCount: number;
  mediaCount: number;
  shouldAutoCreate: boolean;
  sourceEventIds: string[];
}

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface GitHubIssueRecord {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
  htmlUrl: string;
  updatedAt: string;
}

export interface EnsureLabelInput {
  name: string;
  color: string;
  description: string;
}

export interface PipelineState {
  x: {
    sinceId?: string;
    lastReleaseTweetId?: string;
    lastReleaseTweetUrl?: string;
  };
  github: {
    projectId?: string;
  };
  triage: {
    lastRunAt?: string;
  };
  runHistory: Array<{
    at: string;
    mode: 'triage' | 'release' | 'reports';
    dryRun: boolean;
    summary: Record<string, unknown>;
  }>;
}

export interface TriageConfirm {
  approve: Array<{
    candidateId: string;
    edits?: {
      title?: string;
      body?: string;
      labels?: string[];
      priority?: Priority;
    };
  }>;
  reject: string[];
}
