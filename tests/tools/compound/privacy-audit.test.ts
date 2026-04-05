import { describe, it, expect, vi } from 'vitest';
import { createPrivacyAuditTool } from '../../../src/tools/compound/privacy-audit.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    user: {
      email: { type: 'text' },
      password_hash: { type: 'text' },
      name: { type: 'text' },
    },
    payment: {
      credit_card: { type: 'text' },
      cvv: { type: 'text' },
      amount: { type: 'number' },
    },
    order: {
      total: { type: 'number' },
      status: { type: 'text' },
    },
  },
  post: {
    user: {},
    payment: {},
  },
  patch: {},
  delete: {
    payment: {},
  },
};

describe('bubble_privacy_audit', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createPrivacyAuditTool(mockClient);
    expect(tool.name).toBe('bubble_privacy_audit');
    expect(tool.mode).toBe('read-only');
  });

  it('flags sensitive fields like password_hash', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    const issues = data.data.issues as Array<{ severity: string; dataType: string; field?: string }>;
    const sensitiveIssues = issues.filter(i => i.dataType === 'user' && i.field === 'password_hash');
    expect(sensitiveIssues.length).toBeGreaterThan(0);
    expect(sensitiveIssues[0].severity).toBe('critical');
  });

  it('flags PII fields like email', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const issues = data.data.issues as Array<{ severity: string; dataType: string; field?: string }>;
    const piiIssues = issues.filter(i => i.dataType === 'user' && i.field === 'email');
    expect(piiIssues.length).toBeGreaterThan(0);
    expect(piiIssues[0].severity).toBe('warning');
  });

  it('flags credit card and cvv as critical', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const issues = data.data.issues as Array<{ severity: string; dataType: string; field?: string }>;
    const ccIssues = issues.filter(i => i.dataType === 'payment' && i.field === 'credit_card');
    const cvvIssues = issues.filter(i => i.dataType === 'payment' && i.field === 'cvv');
    expect(ccIssues[0].severity).toBe('critical');
    expect(cvvIssues[0].severity).toBe('critical');
  });

  it('flags types exposed via API write (post/delete)', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const issues = data.data.issues as Array<{ type: string; dataType: string }>;
    const apiExposureIssues = issues.filter(i => i.type === 'api_write_exposure');
    expect(apiExposureIssues.length).toBeGreaterThan(0);
  });

  it('returns score, total_types, summary and calls /meta', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(mockClient.get).toHaveBeenCalledWith('/meta');
    expect(typeof data.data.score).toBe('number');
    expect(data.data.score).toBeGreaterThanOrEqual(0);
    expect(data.data.score).toBeLessThanOrEqual(100);
    expect(data.data.total_types).toBe(3);
    expect(data.data.summary).toHaveProperty('critical');
    expect(data.data.summary).toHaveProperty('warnings');
    expect(data.data.summary).toHaveProperty('info');
  });

  it('returns score of 100 when no issues found', async () => {
    const cleanSchema = {
      get: { order: { total: { type: 'number' }, status: { type: 'text' } } },
      post: {},
      patch: {},
      delete: {},
    };
    const mockClient = {
      get: vi.fn().mockResolvedValue(cleanSchema),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.data.score).toBe(100);
    expect(data.data.issues.length).toBe(0);
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createPrivacyAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.success).toBe(false);
  });
});
