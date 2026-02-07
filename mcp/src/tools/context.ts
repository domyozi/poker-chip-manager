import { AppConfig } from '../config.js';
import { GitHubApiClient } from '../adapters/github/github-api.adapter.js';
import { MockGitHubClient } from '../adapters/github/mock.adapter.js';
import { GitHubClient } from '../adapters/github/interface.js';
import { XApiClient } from '../adapters/x/x-api.adapter.js';
import { MockXClient } from '../adapters/x/mock.adapter.js';
import { XClient } from '../adapters/x/interface.js';

export interface ToolContext {
  config: AppConfig;
  xClient: XClient;
  githubClient: GitHubClient;
}

export function createToolContext(config: AppConfig): ToolContext {
  const xClient: XClient = config.x.adapter === 'api' && config.x.bearerToken
    ? new XApiClient(config.x.bearerToken, config.x.userId)
    : new MockXClient();

  const githubClient: GitHubClient = (
    config.github.adapter === 'api' &&
    config.github.token &&
    config.github.owner &&
    config.github.repo
  )
    ? new GitHubApiClient(config.github.token, config.github.owner, config.github.repo)
    : new MockGitHubClient();

  return { config, xClient, githubClient };
}
