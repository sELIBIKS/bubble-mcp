import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorClient } from '../../src/auth/editor-client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const COOKIE_HEADER = 'meta_u1main=user1; meta_live_u2main=sess1';

describe('EditorClient', () => {
  it('constructs with appId, version, and cookie header', () => {
    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    expect(client.appId).toBe('my-app');
  });

  it('loadPaths sends POST to /appeditor/load_multiple_paths with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ last_change: 100, data: [{ data: 'x' }] }),
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.loadPaths([['settings'], ['pages']]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/appeditor/load_multiple_paths/my-app/test');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ path_arrays: [['settings'], ['pages']] });
    expect(options.headers.Cookie).toBe(COOKIE_HEADER);
    expect(result).toEqual({ last_change: 100, data: [{ data: 'x' }] });
  });

  it('loadSinglePath sends GET to correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ last_change: 50, path_version_hash: 'abc123' }),
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.loadSinglePath('settings');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/appeditor/load_single_path/my-app/test/0/settings');
    expect(result).toEqual({ last_change: 50, path_version_hash: 'abc123' });
  });

  it('getChanges sends GET to changes endpoint', async () => {
    const mockChanges = [{ path: ['user_types', 'wallet'], data: {}, action: 'write' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockChanges,
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const result = await client.getChanges(0);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/appeditor\/changes\/my-app\/test\/0\/bubble-mcp-/);
    expect(result).toEqual(mockChanges);
  });

  it('throws EditorApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    await expect(client.loadSinglePath('settings')).rejects.toThrow('Editor API error (401)');
  });

  it('validateSession hits /user/hi and returns boolean', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const valid = await client.validateSession();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://bubble.io/user/hi');
    expect(valid).toBe(true);
  });

  it('validateSession returns false on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const client = new EditorClient('my-app', 'test', COOKIE_HEADER);
    const valid = await client.validateSession();
    expect(valid).toBe(false);
  });
});
