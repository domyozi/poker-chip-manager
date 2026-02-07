import { EnsureLabelInput, GitHubIssueInput, GitHubIssueRecord } from '../../types.js';
import { GitHubClient } from './interface.js';

export class GitHubApiClient implements GitHubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(init?.headers || {})
      }
    });
    if (!res.ok) {
      throw new Error(`GitHub API request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private base(path: string): string {
    return `https://api.github.com/repos/${this.owner}/${this.repo}${path}`;
  }

  async createIssue(input: GitHubIssueInput): Promise<{ issueNumber: number; url: string }> {
    const json = await this.request<{ number: number; html_url: string }>(
      this.base('/issues'),
      { method: 'POST', body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }) }
    );
    return { issueNumber: json.number, url: json.html_url };
  }

  async updateIssue(input: { issueNumber: number; title?: string; body?: string; labels?: string[] }): Promise<{ url: string }> {
    const json = await this.request<{ html_url: string }>(
      this.base(`/issues/${input.issueNumber}`),
      { method: 'PATCH', body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }) }
    );
    return { url: json.html_url };
  }

  async addIssueComment(issueNumber: number, body: string): Promise<void> {
    await this.request(this.base(`/issues/${issueNumber}/comments`), {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  }

  async ensureLabels(labels: EnsureLabelInput[]): Promise<void> {
    for (const label of labels) {
      try {
        await this.request(this.base('/labels'), {
          method: 'POST',
          body: JSON.stringify(label)
        });
      } catch {
        await this.request(this.base(`/labels/${encodeURIComponent(label.name)}`), {
          method: 'PATCH',
          body: JSON.stringify({ color: label.color, description: label.description })
        });
      }
    }
  }

  async ensureProject(name: string): Promise<{ projectId: string }> {
    return { projectId: `github-project-v2:${name}` };
  }

  async addIssueToProject(): Promise<void> {
    return;
  }

  async moveProjectItem(): Promise<void> {
    return;
  }

  async listIssues(): Promise<GitHubIssueRecord[]> {
    const json = await this.request<Array<any>>(this.base('/issues?state=all&per_page=100'));
    return json.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body || '',
      labels: (i.labels || []).map((l: any) => l.name),
      state: i.state,
      htmlUrl: i.html_url,
      updatedAt: i.updated_at
    }));
  }
}
