import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppReviewTool } from '../../../src/tools/core/app-review.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();
const mockEditorClient = { getChanges: mockGetChanges, loadPaths: mockLoadPaths, getDerived: mockGetDerived, appId: 'test-app', version: 'test' };

describe('bubble_app_review', () => {
  beforeEach(() => {
    mockGetChanges.mockReset(); mockLoadPaths.mockReset(); mockGetDerived.mockReset();
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, path: ['user_types', 'a'], data: { '%d': 'Order', privacy_role: {} }, action: 'write' },
      { last_change_date: 2, last_change: 2, path: ['_index', 'page_name_to_id'], data: { index: 'p1' }, action: 'write' },
    ]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});
  });

  it('has correct name and mode', () => {
    const tool = createAppReviewTool(mockEditorClient as any);
    expect(tool.name).toBe('bubble_app_review');
    expect(tool.mode).toBe('read-only');
  });

  it('returns scored review with findings', async () => {
    const tool = createAppReviewTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(typeof data.score).toBe('number');
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.findings.some((f: any) => f.ruleId === 'privacy-no-rules')).toBe(true);
  });
});
