import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createTriggerWorkflowTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_trigger_workflow',
    mode: 'read-write',
    description: 'Trigger a Bubble.io backend workflow (API workflow) by name, optionally passing parameters.',
    inputSchema: {
      workflow_name: z.string().describe('The name of the Bubble API workflow to trigger'),
      params: z.record(z.unknown()).optional().describe('Optional parameters to pass to the workflow'),
    },
    async handler(args) {
      try {
        const workflow_name = args.workflow_name as string;
        const params = args.params as Record<string, unknown> | undefined;
        const response = await client.post(`/wf/${workflow_name}`, params ?? {});
        return successResult(response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
