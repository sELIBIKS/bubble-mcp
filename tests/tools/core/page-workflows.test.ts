import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageWorkflowsTool } from '../../../src/tools/core/page-workflows.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const indexChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_id'],
    data: { index: 'bTGYf' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC' },
  },
];

const indexLoadPathsResult = {
  last_change: 1,
  data: [
    { data: { index: 'bTGYf' } },
    { data: { index: '%p3.bTGbC' } },
  ],
};

const mockWfData = {
  wf1: {
    '%x': 'PageLoaded',
    id: 'wf1',
    actions: [
      { '%x': 'NavigateTo', '%p': { destination: '/home' } },
      { '%x': 'SetState', '%p': { key: 'loaded', value: true } },
    ],
    '%c': null,
  },
  wf2: {
    '%x': 'ButtonClicked',
    id: 'wf2',
    actions: [
      {
        '%x': 'CreateThing',
        '%p': {
          type: 'Message',
          fields: {
            body: { '%x': 'InjectedValue', '%n': { '%x': 'Input', '%nm': 'value' } },
          },
        },
      },
    ],
    '%c': { '%x': 'InjectedValue', '%n': { '%x': 'User', '%nm': 'is_admin' } },
  },
};

describe('bubble_get_page_workflows', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageWorkflowsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_workflows');
    expect(tool.mode).toBe('read-only');
  });

  it('returns all workflows for a page', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths
      .mockResolvedValueOnce(indexLoadPathsResult)
      .mockResolvedValueOnce({
        last_change: 1,
        data: [{ data: mockWfData }],
      });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.workflows).toHaveLength(2);
    expect(data.count).toBe(2);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.workflows[1].eventType).toBe('ButtonClicked');
  });

  it('includes human-readable condition strings by default', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths
      .mockResolvedValueOnce(indexLoadPathsResult)
      .mockResolvedValueOnce({
        last_change: 1,
        data: [{ data: mockWfData }],
      });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    const wf2 = data.workflows.find((w: any) => w.id === 'wf2');
    expect(wf2.condition).toBeDefined();
    expect(typeof wf2.condition).toBe('string');
  });

  it('includes raw expressions when include_expressions is true', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths
      .mockResolvedValueOnce(indexLoadPathsResult)
      .mockResolvedValueOnce({
        last_change: 1,
        data: [{ data: mockWfData }],
      });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', include_expressions: true });
    const data = JSON.parse(result.content[0].text);

    const wf2 = data.workflows.find((w: any) => w.id === 'wf2');
    expect(wf2.conditionRaw).toBeDefined();
    expect(wf2.conditionRaw['%x']).toBe('InjectedValue');
  });

  it('filters workflows by event type', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths
      .mockResolvedValueOnce(indexLoadPathsResult)
      .mockResolvedValueOnce({
        last_change: 1,
        data: [{ data: mockWfData }],
      });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', event_type: 'PageLoaded' });
    const data = JSON.parse(result.content[0].text);

    expect(data.workflows).toHaveLength(1);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.filter).toBe('PageLoaded');
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValueOnce(indexLoadPathsResult);

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
  });
});
