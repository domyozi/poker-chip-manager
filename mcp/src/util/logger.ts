import fs from 'node:fs';
import path from 'node:path';

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendLine(filePath: string, payload: Record<string, unknown>): void {
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

export function createLogger(logDir: string): Logger {
  ensureDir(logDir);
  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(logDir, `${date}.log`);

  return {
    info(message, meta = {}) {
      appendLine(filePath, {
        level: 'info',
        at: new Date().toISOString(),
        message,
        ...meta
      });
    },
    error(message, meta = {}) {
      appendLine(filePath, {
        level: 'error',
        at: new Date().toISOString(),
        message,
        ...meta
      });
    }
  };
}
