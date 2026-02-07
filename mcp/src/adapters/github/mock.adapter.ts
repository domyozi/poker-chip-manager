import fs from 'node:fs';
import path from 'node:path';
import { EnsureLabelInput, GitHubIssueInput, GitHubIssueRecord } from '../../types.js';
import { GitHubClient } from './interface.js';

interface MockDb {
  nextIssueNumber: number;
  labels: EnsureLabelInput[];
  issues: GitHubIssueRecord[];
  projects: Array<{ id: string; name: string; columns: string[]; items: Array<{ issueNumber: number; column: string }> }>;
}

const dbPath = path.join('triage', 'github.mock.db.json');

function loadDb(): MockDb {
  if (!fs.existsSync(dbPath)) {
    return { nextIssueNumber: 1, labels: [], issues: [], projects: [] };
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8')) as MockDb;
}

function saveDb(db: MockDb): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export class MockGitHubClient implements GitHubClient {
  async createIssue(input: GitHubIssueInput): Promise<{ issueNumber: number; url: string }> {
    const db = loadDb();
    const issueNumber = db.nextIssueNumber++;
    db.issues.push({
      number: issueNumber,
      title: input.title,
      body: input.body,
      labels: input.labels,
      state: 'open',
      htmlUrl: `https://github.com/mock/pocket-pot/issues/${issueNumber}`,
      updatedAt: new Date().toISOString()
    });
    saveDb(db);
    return { issueNumber, url: `https://github.com/mock/pocket-pot/issues/${issueNumber}` };
  }

  async updateIssue(input: { issueNumber: number; title?: string; body?: string; labels?: string[] }): Promise<{ url: string }> {
    const db = loadDb();
    const issue = db.issues.find((i) => i.number === input.issueNumber);
    if (!issue) throw new Error(`Issue #${input.issueNumber} not found`);
    if (input.title) issue.title = input.title;
    if (input.body) issue.body = input.body;
    if (input.labels) issue.labels = input.labels;
    issue.updatedAt = new Date().toISOString();
    saveDb(db);
    return { url: issue.htmlUrl };
  }

  async addIssueComment(): Promise<void> {
    return;
  }

  async ensureLabels(labels: EnsureLabelInput[]): Promise<void> {
    const db = loadDb();
    for (const label of labels) {
      if (!db.labels.find((l) => l.name === label.name)) db.labels.push(label);
    }
    saveDb(db);
  }

  async ensureProject(name: string, columns: string[]): Promise<{ projectId: string }> {
    const db = loadDb();
    const existing = db.projects.find((p) => p.name === name);
    if (existing) return { projectId: existing.id };
    const projectId = `mock-project-${db.projects.length + 1}`;
    db.projects.push({ id: projectId, name, columns, items: [] });
    saveDb(db);
    return { projectId };
  }

  async addIssueToProject(issueNumber: number, projectId: string, column: string): Promise<void> {
    const db = loadDb();
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const existing = project.items.find((i) => i.issueNumber === issueNumber);
    if (existing) {
      existing.column = column;
    } else {
      project.items.push({ issueNumber, column });
    }
    saveDb(db);
  }

  async moveProjectItem(issueNumber: number, projectId: string, column: string): Promise<void> {
    await this.addIssueToProject(issueNumber, projectId, column);
  }

  async listIssues(): Promise<GitHubIssueRecord[]> {
    const db = loadDb();
    return db.issues;
  }
}
