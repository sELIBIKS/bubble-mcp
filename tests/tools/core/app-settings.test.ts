import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppSettingsTool } from '../../../src/tools/core/app-settings.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const mockChanges = [
  {
    last_change_date: 1,
    last_change: 1,
    action: 'write',
    path: ['settings', 'client_safe'],
    data: {
      domain: 'myapp.com',
      plugins: { p1: { version: '1.0' } },
      api_token: 'sk-secret-123',
    },
  },
  {
    last_change_date: 1,
    last_change: 1,
    action: 'write',
    path: ['settings', 'secure'],
    data: {
      secret_key: 'very-secret',
      db_password: 'pass123',
      normal_setting: 'visible',
    },
  },
];

describe('bubble_get_app_settings', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  function setupMocks() {
    mockGetChanges.mockResolvedValue(mockChanges);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
  }

  it('has correct name and mode', () => {
    const tool = createAppSettingsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_app_settings');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('returns client_safe settings by default', async () => {
    setupMocks();
    const tool = createAppSettingsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.section).toBe('client_safe');
    expect(data.settings.domain).toBe('myapp.com');
    expect(data.settings.plugins).toEqual({ p1: { version: '1.0' } });
  });

  it('returns secure settings when requested', async () => {
    setupMocks();
    const tool = createAppSettingsTool(mockClient as any);
    const result = await tool.handler({ section: 'secure' });
    const data = JSON.parse(result.content[0].text);
    expect(data.section).toBe('secure');
    expect(data.settings.normal_setting).toBe('visible');
  });

  it('returns all settings when section is "all"', async () => {
    setupMocks();
    const tool = createAppSettingsTool(mockClient as any);
    const result = await tool.handler({ section: 'all' });
    const data = JSON.parse(result.content[0].text);
    expect(data.section).toBe('all');
    expect(data.settings.client_safe).toBeDefined();
    expect(data.settings.secure).toBeDefined();
  });

  it('redacts sensitive values', async () => {
    setupMocks();
    const tool = createAppSettingsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.settings.api_token).toBe('[REDACTED]');

    setupMocks();
    const secureResult = await tool.handler({ section: 'secure' });
    const secureData = JSON.parse(secureResult.content[0].text);
    expect(secureData.settings.secret_key).toBe('[REDACTED]');
    expect(secureData.settings.db_password).toBe('[REDACTED]');
    expect(secureData.settings.normal_setting).toBe('visible');
  });

  it('handles missing settings section', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1,
        last_change: 1,
        action: 'write',
        path: ['settings', 'client_safe'],
        data: { domain: 'myapp.com' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createAppSettingsTool(mockClient as any);
    const result = await tool.handler({ section: 'secure' });
    const data = JSON.parse(result.content[0].text);
    expect(data.section).toBe('secure');
    expect(data.settings).toBeUndefined();
  });
});
