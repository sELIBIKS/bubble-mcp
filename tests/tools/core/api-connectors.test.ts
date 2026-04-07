import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiConnectorsTool } from '../../../src/tools/core/api-connectors.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_get_api_connectors', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createApiConnectorsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_api_connectors');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('returns all workflows when no filter', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf1'],
        data: { '%x': 'APIEvent', '%p': { wf_folder: 'folder1', expose: true, wf_name: 'send-email' }, id: 'wf1', actions: null },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf2'],
        data: { '%x': 'APIEvent', '%p': { wf_folder: 'folder1', expose: false, wf_name: 'process-payment' }, id: 'wf2', actions: null },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createApiConnectorsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.count).toBe(2);
    expect(data.workflows).toHaveLength(2);
    expect(data.workflows.map((w: any) => w.name)).toContain('send-email');
    expect(data.workflows.map((w: any) => w.name)).toContain('process-payment');
    expect(data.workflows[0].type).toBe('APIEvent');
  });

  it('uses incremental wf_name over embedded name', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf1'],
        data: { '%x': 'APIEvent', '%p': { wf_name: 'old-name' }, id: 'wf1', actions: null },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf1', '%p', 'wf_name'],
        data: 'new-name',
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createApiConnectorsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.workflows[0].name).toBe('new-name');
  });

  it('filters by service_name', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf1'],
        data: { '%x': 'APIEvent', '%p': { wf_name: 'send-email' }, id: 'wf1', actions: null },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf2'],
        data: { '%x': 'APIEvent', '%p': { wf_name: 'process-payment' }, id: 'wf2', actions: null },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createApiConnectorsTool(mockClient as any);
    const result = await tool.handler({ service_name: 'Send-Email' });
    const data = JSON.parse(result.content[0].text);

    expect(data.count).toBe(1);
    expect(data.workflows[0].name).toBe('send-email');
  });

  it('returns error when service_name not found', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['api', 'wf1'],
        data: { '%x': 'APIEvent', '%p': { wf_name: 'send-email' }, id: 'wf1', actions: null },
      },
    ]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createApiConnectorsTool(mockClient as any);
    const result = await tool.handler({ service_name: 'NonExistent' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toContain('NonExistent');
    expect(data.hint).toContain('send-email');
  });

  it('handles empty api workflows', async () => {
    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValueOnce({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });

    const tool = createApiConnectorsTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.count).toBe(0);
    expect(data.workflows).toEqual([]);
  });
});
