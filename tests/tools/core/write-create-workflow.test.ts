// tests/tools/core/write-create-workflow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateWorkflowTool } from '../../../src/tools/core/write-create-workflow.js';

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

describe('bubble_create_workflow', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_id'], data: { dashboard: 'abc' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_path'], data: { dashboard: '%p3.def' } },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: { dashboard: 'abc' } }, { data: { dashboard: '%p3.def' } }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_workflow');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a ButtonClicked workflow without actions', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'ButtonClicked',
      element_id: 'elABC',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.eventType).toBe('ButtonClicked');
    expect(data.created.elementId).toBe('elABC');
    expect(data.created.workflowKey).toBeDefined();
    expect(data.created.workflowId).toBeDefined();

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray[0]).toBe('%p3');
    expect(writeCall[0].pathArray[1]).toBe('def');
    expect(writeCall[0].pathArray[2]).toBe('%wf');
    expect(writeCall[0].body['%x']).toBe('ButtonClicked');
    expect(writeCall[0].body['%p']['%ei']).toBe('elABC');
    expect(writeCall[0].body.actions).toBeNull();
  });

  it('creates a PageLoaded workflow (no element_id required)', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'PageLoaded',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body['%x']).toBe('PageLoaded');
    expect(writeCall[0].body['%p']['%ei']).toBeUndefined();
  });

  it('creates a workflow with actions', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'ButtonClicked',
      element_id: 'elABC',
      actions: [
        { type: 'NavigateTo', properties: { destination: 'settings' } },
        { type: 'RefreshPage', properties: {} },
      ],
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(2);

    // Workflow creation
    expect(writeCall[0].body.actions).toBeNull();

    // Actions write
    expect(writeCall[1].pathArray[4]).toBe('actions');
    expect(writeCall[1].body['0']['%x']).toBe('NavigateTo');
    expect(writeCall[1].body['0']['%p'].destination).toBe('settings');
    expect(writeCall[1].body['1']['%x']).toBe('RefreshPage');
    expect(writeCall[1].body['0'].id).toBeDefined();
    expect(writeCall[1].body['1'].id).toBeDefined();
  });

  it('returns error when page not found', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      event_type: 'PageLoaded',
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
