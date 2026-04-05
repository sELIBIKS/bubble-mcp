import { describe, it, expect, vi } from 'vitest';
import { createHealthCheckTool } from '../../../src/tools/developer/health-check.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      password_hash: { type: 'text' },
      name: { type: 'text' },
    },
    order: {
      total: { type: 'number' },
      status: { type: 'text' },
      customer: { type: 'custom.user' },
    },
  },
  post: { user: {} },
  patch: {},
  delete: {},
};

const emptyResponse = { response: { results: [] } };

describe('bubble_health_check', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createHealthCheckTool(mockClient);
    expect(tool.name).toBe('bubble_health_check');
    expect(tool.mode).toBe('read-only');
  });

  it('returns score, sections, recommendations, and total_types', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve(emptyResponse);
      }),
    } as unknown as BubbleClient;

    const tool = createHealthCheckTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.score).toBe('number');
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data.sections).toHaveProperty('privacy');
    expect(data.sections).toHaveProperty('data_model');
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeLessThanOrEqual(5);
    expect(data.total_types).toBe(2);
  });

  it('privacy section detects sensitive fields', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve(emptyResponse);
      }),
    } as unknown as BubbleClient;

    const tool = createHealthCheckTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const privacyIssues: string[] = data.sections.privacy.issues;
    expect(privacyIssues.some(i => i.includes('password_hash'))).toBe(true);
  });

  it('privacy score is lower than 100 when issues exist', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve(emptyResponse);
      }),
    } as unknown as BubbleClient;

    const tool = createHealthCheckTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.sections.privacy.score).toBeLessThan(100);
  });

  it('data_model section detects dead fields', async () => {
    const singleRecord = {
      response: {
        results: [
          { _id: '1', 'Created Date': '2024-01-01', 'Modified Date': '2024-01-01', total: null, status: null, customer: null },
        ],
      },
    };

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve(singleRecord);
      }),
    } as unknown as BubbleClient;

    const tool = createHealthCheckTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const dmIssues: string[] = data.sections.data_model.issues;
    expect(dmIssues.length).toBeGreaterThan(0);
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createHealthCheckTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
