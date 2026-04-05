import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createGetTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_get',
    mode: 'read-only',
    description: 'Retrieve a single Bubble.io data object by its data type and unique ID.',
    inputSchema: {
      dataType: z.string().describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().describe('The unique ID of the record to retrieve'),
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const id = args.id as string;
        const response = await client.get<{ response: unknown }>(`/obj/${dataType}/${id}`);
        return successResult(response.response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
