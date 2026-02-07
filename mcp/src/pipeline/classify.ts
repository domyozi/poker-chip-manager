import { Priority } from '../types.js';

const RULES: Array<{ priority: Priority; regex: RegExp[] }> = [
  {
    priority: 'P0',
    regex: [/起動しない/, /操作不能/, /固まる/, /進めない/, /データ.*消/, /cannot play/i, /stuck/i, /corrupt/i]
  },
  {
    priority: 'P1',
    regex: [/ターン順/, /レイズ.*おかしい/, /進行.*おかしい/, /min.?raise/i, /turn order/i, /blind.*wrong/i]
  },
  {
    priority: 'P2',
    regex: [/見づらい/, /わかりにくい/, /レイアウト/, /ui/i, /ux/i, /confusing/i, /表示崩れ/]
  }
];

export function classifyPriority(text: string): Priority {
  for (const rule of RULES) {
    if (rule.regex.some((r) => r.test(text))) return rule.priority;
  }
  return 'P3';
}

export function shouldAutoCreateStrict(args: {
  priority: Priority;
  hasReproSteps: boolean;
  mediaCount: number;
  uniqueReporterCount: number;
}): boolean {
  if (args.priority !== 'P0' && args.priority !== 'P1') return false;
  return args.hasReproSteps || args.mediaCount > 0 || args.uniqueReporterCount >= 2;
}
