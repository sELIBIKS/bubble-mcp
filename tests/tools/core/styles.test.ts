import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStylesTool } from '../../../src/tools/core/styles.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_get_styles', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createStylesTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_styles');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('returns all styles when no filter', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style1'],
        data: { '%d': 'Primary Button', '%type': 'Button', backgroundColor: '#3B82F6', borderRadius: 8 },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style2'],
        data: { '%d': 'Body Text', '%type': 'Text', fontSize: 16, color: '#111827' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createStylesTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
    expect(data.styles).toHaveLength(2);
    expect(data.styles[0]).toHaveProperty('name');
    expect(data.styles[0]).toHaveProperty('key');
    expect(data.styles[0]).toHaveProperty('elementType');
    expect(data.styles[0]).toHaveProperty('properties');
    expect(data.styles[0]).not.toHaveProperty('raw');
  });

  it('filters by element_type', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style1'],
        data: { '%d': 'Primary Button', '%type': 'Button', backgroundColor: '#3B82F6' },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style2'],
        data: { '%d': 'Body Text', '%type': 'Text', fontSize: 16 },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style3'],
        data: { '%d': 'Secondary Button', '%type': 'Button', backgroundColor: '#6B7280' },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createStylesTool(mockClient as any);
    const result = await tool.handler({ element_type: 'Button' });
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
    expect(data.styles).toHaveLength(2);
    expect(data.styles.every((s: any) => s.elementType === 'Button')).toBe(true);
  });

  it('handles no styles gracefully', async () => {
    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createStylesTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.styles).toEqual([]);
    expect(data.count).toBe(0);
    expect(data.note).toBe('No custom styles defined in this app');
  });

  it('element_type filter is case-insensitive', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style1'],
        data: { '%d': 'Primary Button', '%type': 'Button', backgroundColor: '#3B82F6' },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['styles', 'style2'],
        data: { '%d': 'Body Text', '%type': 'Text', fontSize: 16 },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createStylesTool(mockClient as any);
    const result = await tool.handler({ element_type: 'button' });
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.styles[0].elementType).toBe('Button');
  });
});
