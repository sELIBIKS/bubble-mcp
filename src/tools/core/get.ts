import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

export function createGetTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_get',
    mode: 'read-only',
    description: 'Retrieve a single Bubble.io data object by its data type and unique ID.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name (e.g. "user", "order")'),
      id: z.string().min(1).describe('The unique ID of the record to retrieve'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const id = validateIdentifier(args.id as string, 'id');
        const response = await client.get<{ response: unknown }>(`/obj/${dataType}/${id}`);
        return successResult(response.response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
