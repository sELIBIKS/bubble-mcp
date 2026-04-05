import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createReplaceTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_replace',
    mode: 'read-write',
    description:
      'Replace all fields of a Bubble.io record (PUT). WARNING: Any fields NOT included will be reset to defaults. Use bubble_update (PATCH) for partial changes.',
    inputSchema: {
      dataType: z.string().describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().describe('The unique ID of the record to replace'),
      fields: z.record(z.unknown()).describe('Complete field values for the record — all fields must be provided'),
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const id = args.id as string;
        const fields = args.fields as Record<string, unknown>;
        await client.put(`/obj/${dataType}/${id}`, fields);
        return successResult({ success: true, id, operation: 'replace' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
