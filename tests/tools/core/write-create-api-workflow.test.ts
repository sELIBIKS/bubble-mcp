import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateApiWorkflowTool } from '../../../src/tools/core/write-create-api-workflow.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockWrite = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  write: mockWrite,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_create_api_workflow', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createCreateApiWorkflowTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_api_workflow');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a workflow with correct payload structure', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createCreateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({ workflow_name: 'send-welcome-email' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.created.name).toBe('send-welcome-email');
    expect(data.created.key).toHaveLength(5);
    expect(data.created.id).toHaveLength(5);
    expect(data.created.exposed).toBe(false);

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray[0]).toBe('api');
    expect(writeCall[0].pathArray[1]).toHaveLength(5);
    expect(writeCall[0].body).toEqual({
      '%x': 'APIEvent',
      '%p': { expose: false, wf_name: 'send-welcome-email' },
      id: data.created.id,
      actions: null,
    });
  });

  it('returns error if workflow name already exists', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1,
        last_change: 1,
        action: 'write',
        path: ['api', 'wf1'],
        data: {
          '%x': 'APIEvent',
          '%p': { wf_name: 'send-email', expose: false },
          id: 'id1',
          actions: null,
        },
      },
    ]);

    const tool = createCreateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({ workflow_name: 'Send-Email' });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('already exists');
  });

  it('defaults expose to false', async () => {
    mockGetChanges.mockResolvedValue([]);

    const tool = createCreateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({ workflow_name: 'my-workflow' });
    const data = JSON.parse(result.content[0].text);

    expect(data.created.exposed).toBe(false);
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body['%p'].expose).toBe(false);
  });
});
