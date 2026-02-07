import path from 'node:path';
import fs from 'node:fs';

export interface AppConfig {
  dryRun: boolean;
  apply: boolean;
  autoCreateStrict: boolean;
  statePath: string;
  logDir: string;
  triageInboxJsonPath: string;
  triageInboxMdPath: string;
  triageConfirmPath: string;
  changelogPath: string;
  progressPath: string;
  roadmapPath: string;
  x: {
    adapter: 'mock' | 'api';
    bearerToken?: string;
    userId?: string;
    apiKey?: string;
    apiKeySecret?: string;
    accessToken?: string;
    accessTokenSecret?: string;
  };
  github: {
    adapter: 'mock' | 'api';
    token?: string;
    owner?: string;
    repo?: string;
    projectName: string;
  };
  llm: {
    apiKey?: string;
    model: string;
  };
}

let envLoaded = false;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnvFromFile(filepath = '.env'): void {
  if (envLoaded) return;
  envLoaded = true;
  if (!fs.existsSync(filepath)) return;

  const raw = fs.readFileSync(filepath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = stripWrappingQuotes(trimmed.slice(eq + 1));
    if (!key) continue;
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

function parseFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getConfig(): AppConfig {
  loadDotEnvFromFile();
  const apply = parseFlag('--apply');
  const dryRun = !apply;

  return {
    dryRun,
    apply,
    autoCreateStrict: parseBool(process.env.AUTO_CREATE_STRICT, true),
    statePath: process.env.STATE_PATH || path.join('triage', 'state.json'),
    logDir: process.env.LOG_DIR || 'logs',
    triageInboxJsonPath: path.join('triage', 'inbox.json'),
    triageInboxMdPath: path.join('triage', 'inbox.md'),
    triageConfirmPath: path.join('triage', 'confirm.json'),
    changelogPath: 'CHANGELOG.md',
    progressPath: 'PROGRESS.md',
    roadmapPath: 'ROADMAP.md',
    x: {
      adapter: (process.env.X_ADAPTER as 'mock' | 'api') || 'mock',
      bearerToken: process.env.X_BEARER_TOKEN,
      userId: process.env.X_USER_ID,
      apiKey: process.env.X_API_KEY,
      apiKeySecret: process.env.X_API_KEY_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET
    },
    github: {
      adapter: (process.env.GITHUB_ADAPTER as 'mock' | 'api') || 'mock',
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
      projectName: process.env.GITHUB_PROJECT_NAME || 'Pocket Pot Dev'
    },
    llm: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL || 'gpt-4o-mini'
    }
  };
}
