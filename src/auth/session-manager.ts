import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
}

interface SessionEntry {
  cookies: StoredCookie[];
  version?: string; // branch ID or 'test'/'live'
}

interface SessionStore {
  [appId: string]: StoredCookie[] | SessionEntry;
}

function normalizeEntry(raw: StoredCookie[] | SessionEntry): SessionEntry {
  if (Array.isArray(raw)) return { cookies: raw };
  return raw;
}

export interface SessionManager {
  save(appId: string, cookies: StoredCookie[], version?: string): void;
  load(appId: string): StoredCookie[] | null;
  getVersion(appId: string): string | null;
  clear(appId: string): void;
  clearAll(): void;
  getCookieHeader(appId: string): string | null;
  listApps(): string[];
}

const DEFAULT_DIR = join(homedir(), '.bubble-mcp');

export function createSessionManager(dir: string = DEFAULT_DIR): SessionManager {
  const filePath = join(dir, 'sessions.json');

  function ensureDir(): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function readStore(): SessionStore {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  function writeStore(store: SessionStore): void {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  return {
    save(appId, cookies, version) {
      const store = readStore();
      store[appId] = { cookies, version };
      writeStore(store);
    },

    load(appId) {
      const store = readStore();
      const raw = store[appId];
      if (!raw) return null;
      return normalizeEntry(raw).cookies;
    },

    getVersion(appId) {
      const store = readStore();
      const raw = store[appId];
      if (!raw) return null;
      return normalizeEntry(raw).version ?? null;
    },

    clear(appId) {
      const store = readStore();
      delete store[appId];
      writeStore(store);
    },

    clearAll() {
      writeStore({});
    },

    getCookieHeader(appId) {
      const cookies = this.load(appId);
      if (!cookies || cookies.length === 0) return null;
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    },

    listApps() {
      const store = readStore();
      return Object.keys(store);
    },
  };
}

export async function checkStatus(): Promise<void> {
  const mgr = createSessionManager();
  const apps = mgr.listApps();
  if (apps.length === 0) {
    console.log('No saved sessions. Run: bubble-mcp auth login <app-id>');
    return;
  }
  for (const appId of apps) {
    const cookies = mgr.load(appId);
    const cookieCount = cookies?.length ?? 0;
    console.log(`  ${appId}: ${cookieCount} cookies stored`);
  }
}

export function clearSession(): void {
  const mgr = createSessionManager();
  mgr.clearAll();
}
