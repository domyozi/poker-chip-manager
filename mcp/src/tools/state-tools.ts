import fs from 'node:fs';
import path from 'node:path';
import { PipelineState } from '../types.js';

const defaultState: PipelineState = {
  x: {},
  github: {},
  triage: {},
  runHistory: []
};

export function loadState(statePath: string): PipelineState {
  if (!fs.existsSync(statePath)) return { ...defaultState };
  const raw = fs.readFileSync(statePath, 'utf8');
  return { ...defaultState, ...(JSON.parse(raw) as PipelineState) };
}

export function saveState(statePath: string, state: PipelineState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
