import path from 'node:path';

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

function parseFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getConfig(): AppConfig {
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
      userId: process.env.X_USER_ID
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
