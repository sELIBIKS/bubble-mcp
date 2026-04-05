import { describe, it, expect, vi } from 'vitest';
import { createWorkflowMapTool } from '../../../src/tools/developer/workflow-map.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_workflow_map', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createWorkflowMapTool(mockClient);
    expect(tool.name).toBe('bubble_workflow_map');
    expect(tool.mode).toBe('read-only');
  });

  it('returns workflows when api_workflows present', async () => {
    const mockSchema = {
      get: {},
      post: {},
      patch: {},
      delete: {},
      api_workflows: [
        { name: 'send_email', parameters: [{ name: 'user_id', type: 'text' }] },
        { name: 'process_payment', parameters: [] },
      ],
    };

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createWorkflowMapTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.workflows.length).toBe(2);
    expect(data.data.total).toBe(2);
    expect(data.data.workflows[0].name).toBe('send_email');
  });

  it('returns empty with message when no api_workflows key', async () => {
    const mockSchema = { get: {}, post: {}, patch: {}, delete: {} };

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createWorkflowMapTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.data.workflows).toEqual([]);
    expect(data.data.total).toBe(0);
    expect(typeof data.data.message).toBe('string');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createWorkflowMapTool(mockClient);
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
  });
});
