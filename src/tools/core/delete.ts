import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createDeleteTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_delete',
    mode: 'admin',
    description: 'Permanently delete a Bubble.io record by data type and ID. This action cannot be undone.',
    inputSchema: {
      dataType: z.string().describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().describe('The unique ID of the record to delete'),
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const id = args.id as string;
        await client.delete(`/obj/${dataType}/${id}`);
        return successResult({ success: true, id, operation: 'delete' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
