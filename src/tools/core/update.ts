import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

export function createUpdateTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_update',
    mode: 'read-write',
    description:
      'Partially update a Bubble.io record. Only the provided fields are changed; all other fields retain their current values.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().min(1).describe('The unique ID of the record to update'),
      fields: z.record(z.unknown()).describe('Partial field values to update on the record'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const id = validateIdentifier(args.id as string, 'id');
        const fields = args.fields as Record<string, unknown>;
        await client.patch(`/obj/${dataType}/${id}`, fields);
        return successResult({ id, operation: 'update' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
