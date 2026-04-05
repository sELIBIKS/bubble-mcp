import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

export function createDeleteTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_delete',
    mode: 'admin',
    description:
      'Permanently delete a Bubble.io record by data type and ID. This action cannot be undone.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().min(1).describe('The unique ID of the record to delete'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const id = validateIdentifier(args.id as string, 'id');
        await client.delete(`/obj/${dataType}/${id}`);
        return successResult({ id, operation: 'delete' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
