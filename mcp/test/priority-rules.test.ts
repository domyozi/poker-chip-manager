import { describe, expect, it } from 'vitest';
import { classifyPriority } from '../src/pipeline/classify.js';

describe('classifyPriority', () => {
  it('detects P0 keywords', () => {
    expect(classifyPriority('アプリが固まって進めない')).toBe('P0');
  });

  it('detects P1 keywords', () => {
    expect(classifyPriority('ターン順がおかしい')).toBe('P1');
  });

  it('detects P2 keywords', () => {
    expect(classifyPriority('UIが見づらい')).toBe('P2');
  });

  it('falls back to P3', () => {
    expect(classifyPriority('こういう機能があったら嬉しい')).toBe('P3');
  });
});
