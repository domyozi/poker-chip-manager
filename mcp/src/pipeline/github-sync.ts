import { GitHubClient } from '../adapters/github/interface.js';
import { IssueCandidate } from '../types.js';

const PROJECT_COLUMNS = ['Inbox', 'Triage', 'Ready', 'In Progress', 'Done'];

export async function ensureGitHubBase(client: GitHubClient, projectName: string): Promise<{ projectId: string }> {
  await client.ensureLabels([
    { name: 'priority:P0', color: 'B60205', description: 'Critical' },
    { name: 'priority:P1', color: 'D93F0B', description: 'High' },
    { name: 'priority:P2', color: 'FBCA04', description: 'Medium' },
    { name: 'priority:P3', color: '0E8A16', description: 'Low' },
    { name: 'source:x', color: '1D76DB', description: 'From X feedback' }
  ]);
  return client.ensureProject(projectName, PROJECT_COLUMNS);
}

export async function createIssuesFromCandidates(
  client: GitHubClient,
  projectId: string,
  candidates: IssueCandidate[]
): Promise<Array<{ candidateId: string; issueNumber: number; url: string }>> {
  const created: Array<{ candidateId: string; issueNumber: number; url: string }> = [];
  for (const candidate of candidates) {
    const labels = [`priority:${candidate.priority}`, 'source:x'];
    const issue = await client.createIssue({ title: candidate.title, body: candidate.body, labels });
    await client.addIssueToProject(issue.issueNumber, projectId, 'Inbox');
    created.push({ candidateId: candidate.candidateId, issueNumber: issue.issueNumber, url: issue.url });
  }
  return created;
}
