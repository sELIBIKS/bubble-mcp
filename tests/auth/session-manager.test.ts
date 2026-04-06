import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bubble-mcp-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function getManager(dir: string) {
  const mod = await import('../../src/auth/session-manager.js');
  return mod.createSessionManager(dir);
}

describe('SessionManager', () => {
  it('saves and loads cookies for an app', async () => {
    const mgr = await getManager(tempDir);
    const cookies = [
      { name: 'meta_u1main', value: 'user123', domain: '.bubble.io' },
      { name: 'meta_live_u2main', value: 'session456', domain: '.bubble.io' },
    ];
    mgr.save('my-app', cookies);
    const loaded = mgr.load('my-app');
    expect(loaded).toEqual(cookies);
  });

  it('returns null for unknown app', async () => {
    const mgr = await getManager(tempDir);
    expect(mgr.load('nonexistent')).toBeNull();
  });

  it('clears a specific app session', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [{ name: 'a', value: '1', domain: '.bubble.io' }]);
    mgr.save('app2', [{ name: 'b', value: '2', domain: '.bubble.io' }]);
    mgr.clear('app1');
    expect(mgr.load('app1')).toBeNull();
    expect(mgr.load('app2')).not.toBeNull();
  });

  it('clears all sessions', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [{ name: 'a', value: '1', domain: '.bubble.io' }]);
    mgr.clearAll();
    expect(mgr.load('app1')).toBeNull();
  });

  it('persists to disk as JSON file', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('my-app', [{ name: 'x', value: 'y', domain: '.bubble.io' }]);
    const filePath = join(tempDir, 'sessions.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content['my-app']).toBeDefined();
  });

  it('formats cookies as a header string', async () => {
    const mgr = await getManager(tempDir);
    mgr.save('app1', [
      { name: 'a', value: '1', domain: '.bubble.io' },
      { name: 'b', value: '2', domain: '.bubble.io' },
    ]);
    const header = mgr.getCookieHeader('app1');
    expect(header).toBe('a=1; b=2');
  });

  it('returns null cookie header for unknown app', async () => {
    const mgr = await getManager(tempDir);
    expect(mgr.getCookieHeader('nope')).toBeNull();
  });
});
