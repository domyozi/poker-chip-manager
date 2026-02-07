import { GitHubClient } from '../../src/adapters/github/interface.js';
import { EnsureLabelInput, GitHubIssueInput, GitHubIssueRecord } from '../../src/types.js';

export class TestGitHubMock implements GitHubClient {
  public issues: GitHubIssueRecord[] = [];

  async createIssue(input: GitHubIssueInput): Promise<{ issueNumber: number; url: string }> {
    const issueNumber = this.issues.length + 1;
    this.issues.push({
      number: issueNumber,
      title: input.title,
      body: input.body,
      labels: input.labels,
      state: 'open',
      htmlUrl: `https://github.com/mock/issues/${issueNumber}`,
      updatedAt: new Date().toISOString()
    });
    return { issueNumber, url: `https://github.com/mock/issues/${issueNumber}` };
  }

  async updateIssue(): Promise<{ url: string }> { return { url: 'ok' }; }
  async addIssueComment(): Promise<void> { return; }
  async ensureLabels(_: EnsureLabelInput[]): Promise<void> { return; }
  async ensureProject(): Promise<{ projectId: string }> { return { projectId: 'p1' }; }
  async addIssueToProject(): Promise<void> { return; }
  async moveProjectItem(): Promise<void> { return; }
  async listIssues(): Promise<GitHubIssueRecord[]> { return this.issues; }
}
