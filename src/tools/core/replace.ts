import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

export function createReplaceTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_replace',
    mode: 'read-write',
    description:
      'Replace all fields of a Bubble.io record (PUT). WARNING: Any fields NOT included will be reset to defaults. Use bubble_update (PATCH) for partial changes.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().min(1).describe('The unique ID of the record to replace'),
      fields: z
        .record(z.unknown())
        .describe('Complete field values for the record — all fields must be provided'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const id = validateIdentifier(args.id as string, 'id');
        const fields = args.fields as Record<string, unknown>;
        await client.put(`/obj/${dataType}/${id}`, fields);
        return successResult({ id, operation: 'replace' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
