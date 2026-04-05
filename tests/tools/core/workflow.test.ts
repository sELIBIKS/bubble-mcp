import { describe, it, expect, vi } from 'vitest';
import { createTriggerWorkflowTool } from '../../../src/tools/core/workflow.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

describe('bubble_trigger_workflow', () => {
  it('has correct name and mode', () => {
    const mockClient = { post: vi.fn() } as unknown as BubbleClient;
    const tool = createTriggerWorkflowTool(mockClient);
    expect(tool.name).toBe('bubble_trigger_workflow');
    expect(tool.mode).toBe('read-write');
  });

  it('calls the correct endpoint with workflow_name', async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as BubbleClient;

    const tool = createTriggerWorkflowTool(mockClient);
    await tool.handler({ workflow_name: 'send_email' });

    expect(mockClient.post).toHaveBeenCalledWith('/wf/send_email', {});
  });

  it('passes params when provided', async () => {
    const mockClient = {
      post: vi.fn().mockResolvedValue({ status: 'success' }),
    } as unknown as BubbleClient;

    const tool = createTriggerWorkflowTool(mockClient);
    await tool.handler({ workflow_name: 'send_email', params: { recipient: 'test@example.com' } });

    expect(mockClient.post).toHaveBeenCalledWith('/wf/send_email', { recipient: 'test@example.com' });
  });

  it('returns successResult with the response', async () => {
    const mockResponse = { status: 'success', message: 'Workflow triggered' };
    const mockClient = {
      post: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as BubbleClient;

    const tool = createTriggerWorkflowTool(mockClient);
    const result = await tool.handler({ workflow_name: 'send_email' });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual(mockResponse);
    expect(result.isError).toBeUndefined();
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      post: vi.fn().mockRejectedValue(new Error('Workflow not found')),
    } as unknown as BubbleClient;

    const tool = createTriggerWorkflowTool(mockClient);
    const result = await tool.handler({ workflow_name: 'nonexistent' });
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
