import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('loads from env vars', () => {
    process.env.BUBBLE_APP_URL = 'https://test.bubbleapps.io';
    process.env.BUBBLE_API_TOKEN = 'test-token';
    process.env.BUBBLE_MODE = 'read-write';
    process.env.BUBBLE_ENVIRONMENT = 'live';
    process.env.BUBBLE_RATE_LIMIT = '120';

    const config = loadConfig();
    expect(config.appUrl).toBe('https://test.bubbleapps.io');
    expect(config.apiToken).toBe('test-token');
    expect(config.mode).toBe('read-write');
    expect(config.environment).toBe('live');
    expect(config.rateLimit).toBe(120);
  });

  it('uses defaults for optional fields', () => {
    process.env.BUBBLE_APP_URL = 'https://test.bubbleapps.io';
    process.env.BUBBLE_API_TOKEN = 'test-token';
    const config = loadConfig();
    expect(config.mode).toBe('read-only');
    expect(config.environment).toBe('development');
    expect(config.rateLimit).toBe(60);
  });

  it('throws if BUBBLE_APP_URL is missing', () => {
    process.env.BUBBLE_API_TOKEN = 'test-token';
    delete process.env.BUBBLE_APP_URL;
    expect(() => loadConfig()).toThrow('BUBBLE_APP_URL');
  });

  it('throws if BUBBLE_API_TOKEN is missing', () => {
    process.env.BUBBLE_APP_URL = 'https://test.bubbleapps.io';
    delete process.env.BUBBLE_API_TOKEN;
    expect(() => loadConfig()).toThrow('BUBBLE_API_TOKEN');
  });

  it('throws on invalid mode', () => {
    process.env.BUBBLE_APP_URL = 'https://test.bubbleapps.io';
    process.env.BUBBLE_API_TOKEN = 'test-token';
    process.env.BUBBLE_MODE = 'invalid';
    expect(() => loadConfig()).toThrow('BUBBLE_MODE');
  });

  it('strips trailing slash from URL', () => {
    process.env.BUBBLE_APP_URL = 'https://test.bubbleapps.io/';
    process.env.BUBBLE_API_TOKEN = 'test-token';
    expect(loadConfig().appUrl).toBe('https://test.bubbleapps.io');
  });

  it('loads from JSON file via BUBBLE_CONFIG_PATH', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpFile = path.join(os.tmpdir(), 'bubble-test-config.json');
    fs.writeFileSync(tmpFile, JSON.stringify({
      app_url: 'https://file-app.bubbleapps.io',
      api_token: 'file-token',
      mode: 'admin',
      environment: 'live',
      rate_limit: 200
    }));
    process.env.BUBBLE_CONFIG_PATH = tmpFile;
    const config = loadConfig();
    expect(config.appUrl).toBe('https://file-app.bubbleapps.io');
    expect(config.mode).toBe('admin');
    fs.unlinkSync(tmpFile);
  });
});
