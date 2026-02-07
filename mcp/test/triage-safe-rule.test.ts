import { describe, expect, it } from 'vitest';
import { shouldAutoCreateStrict } from '../src/pipeline/classify.js';

describe('shouldAutoCreateStrict', () => {
  it('allows P0 with repro', () => {
    expect(shouldAutoCreateStrict({
      priority: 'P0',
      hasReproSteps: true,
      mediaCount: 0,
      uniqueReporterCount: 1
    })).toBe(true);
  });

  it('blocks P1 without evidence', () => {
    expect(shouldAutoCreateStrict({
      priority: 'P1',
      hasReproSteps: false,
      mediaCount: 0,
      uniqueReporterCount: 1
    })).toBe(false);
  });

  it('blocks non P0/P1', () => {
    expect(shouldAutoCreateStrict({
      priority: 'P2',
      hasReproSteps: true,
      mediaCount: 1,
      uniqueReporterCount: 3
    })).toBe(false);
  });
});
