import { describe, it, expect } from 'vitest';
import { createEnvironmentTool } from '../../../src/tools/core/environment.js';
import type { BubbleConfig } from '../../../src/types.js';

const mockConfig: BubbleConfig = {
  appUrl: 'https://myapp.bubbleapps.io',
  apiToken: 'super-secret-token',
  mode: 'read-only',
  environment: 'development',
  rateLimit: 60,
};

describe('bubble_get_environment', () => {
  it('has correct name and mode', () => {
    const tool = createEnvironmentTool(mockConfig);
    expect(tool.name).toBe('bubble_get_environment');
    expect(tool.mode).toBe('read-only');
  });

  it('returns environment info without the API token', async () => {
    const tool = createEnvironmentTool(mockConfig);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.app_url).toBe('https://myapp.bubbleapps.io');
    expect(data.environment).toBe('development');
    expect(data.mode).toBe('read-only');
    expect(data.rate_limit).toBe(60);
  });

  it('does not expose the API token', async () => {
    const tool = createEnvironmentTool(mockConfig);
    const result = await tool.handler({});
    const text = result.content[0].text;

    expect(text).not.toContain('super-secret-token');
    expect(text).not.toContain('apiToken');
    expect(text).not.toContain('api_token');
  });

  it('works correctly in live mode', async () => {
    const liveConfig: BubbleConfig = { ...mockConfig, environment: 'live', mode: 'admin', rateLimit: 120 };
    const tool = createEnvironmentTool(liveConfig);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.environment).toBe('live');
    expect(data.mode).toBe('admin');
    expect(data.rate_limit).toBe(120);
  });
});
