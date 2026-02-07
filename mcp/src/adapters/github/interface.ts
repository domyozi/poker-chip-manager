import { EnsureLabelInput, GitHubIssueInput, GitHubIssueRecord } from '../../types.js';

export interface GitHubClient {
  createIssue(input: GitHubIssueInput): Promise<{ issueNumber: number; url: string }>;
  updateIssue(input: {
    issueNumber: number;
    title?: string;
    body?: string;
    labels?: string[];
  }): Promise<{ url: string }>;
  addIssueComment(issueNumber: number, body: string): Promise<void>;
  ensureLabels(labels: EnsureLabelInput[]): Promise<void>;
  ensureProject(name: string, columns: string[]): Promise<{ projectId: string }>;
  addIssueToProject(issueNumber: number, projectId: string, column: string): Promise<void>;
  moveProjectItem(issueNumber: number, projectId: string, column: string): Promise<void>;
  listIssues(): Promise<GitHubIssueRecord[]>;
}
