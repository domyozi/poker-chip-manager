import { FeedbackEvent } from '../types.js';

export interface FeedbackCluster {
  key: string;
  events: FeedbackEvent[];
}

export function dedupeEvents(events: FeedbackEvent[]): FeedbackCluster[] {
  const map = new Map<string, FeedbackEvent[]>();
  for (const event of events) {
    const key = event.fingerprint;
    const list = map.get(key) || [];
    list.push(event);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, list]) => ({ key, events: list }));
}
