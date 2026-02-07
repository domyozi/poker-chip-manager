import fs from 'node:fs';
import path from 'node:path';
import { IssueCandidate, TriageConfirm } from '../types.js';

export function loadConfirmFile(confirmPath: string): TriageConfirm {
  if (!fs.existsSync(confirmPath)) {
    return { approve: [], reject: [] };
  }
  return JSON.parse(fs.readFileSync(confirmPath, 'utf8')) as TriageConfirm;
}

export function applyConfirm(candidates: IssueCandidate[], confirm: TriageConfirm): IssueCandidate[] {
  const rejected = new Set(confirm.reject);
  const approvedMap = new Map(confirm.approve.map((i) => [i.candidateId, i.edits]));

  return candidates
    .filter((c) => !rejected.has(c.candidateId))
    .filter((c) => approvedMap.has(c.candidateId) || c.shouldAutoCreate)
    .map((c) => {
      const edits = approvedMap.get(c.candidateId);
      if (!edits) return c;
      return {
        ...c,
        title: edits.title || c.title,
        body: edits.body || c.body,
        priority: edits.priority || c.priority
      };
    });
}

export function ensureConfirmTemplate(confirmPath: string): void {
  if (fs.existsSync(confirmPath)) return;
  fs.mkdirSync(path.dirname(confirmPath), { recursive: true });
  fs.writeFileSync(confirmPath, JSON.stringify({ approve: [], reject: [] }, null, 2));
}
