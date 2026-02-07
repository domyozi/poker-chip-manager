import fs from 'node:fs';

export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const fd = fs.openSync(lockPath, 'w');
  try {
    fs.writeFileSync(fd, String(process.pid));
    return await fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}
