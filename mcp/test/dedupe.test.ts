import { describe, expect, it } from 'vitest';
import { dedupeEvents } from '../src/pipeline/dedupe.js';

describe('dedupeEvents', () => {
  it('groups same fingerprint into one cluster', () => {
    const events = [
      { id: '1', fingerprint: 'abc' },
      { id: '2', fingerprint: 'abc' },
      { id: '3', fingerprint: 'xyz' }
    ] as any;

    const clusters = dedupeEvents(events);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.key === 'abc')?.events).toHaveLength(2);
  });
});
