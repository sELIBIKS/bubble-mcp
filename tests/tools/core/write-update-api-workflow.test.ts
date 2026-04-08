import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateApiWorkflowTool } from '../../../src/tools/core/write-update-api-workflow.js';

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

describe('bubble_update_api_workflow', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
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
    const tool = createUpdateApiWorkflowTool(mockClient as any);
    expect(tool.name).toBe('bubble_update_api_workflow');
    expect(tool.mode).toBe('read-write');
  });

  it('updates workflow name', async () => {
    const tool = createUpdateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({
      workflow_name: 'send-email',
      new_name: 'send-notification',
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.updated.name).toBe('send-notification');
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: 'send-notification',
        pathArray: ['api', 'wf1', '%p', 'wf_name'],
      },
    ]);
  });

  it('updates expose flag', async () => {
    const tool = createUpdateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({
      workflow_name: 'send-email',
      expose: true,
    });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(data.updated.exposed).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith([
      {
        body: true,
        pathArray: ['api', 'wf1', '%p', 'expose'],
      },
    ]);
  });

  it('returns error when workflow not found', async () => {
    const tool = createUpdateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({
      workflow_name: 'nonexistent',
      new_name: 'something',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('send-email');
  });

  it('returns error when no changes specified', async () => {
    const tool = createUpdateApiWorkflowTool(mockClient as any);
    const result = await tool.handler({
      workflow_name: 'send-email',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('No changes specified');
  });
});
