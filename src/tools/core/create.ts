import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

export function createCreateTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_create',
    mode: 'read-write',
    description: 'Create a new record in a Bubble.io data type.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name (e.g. "user", "order")'),
      fields: z.record(z.unknown()).describe('Field values to set on the new record'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const fields = args.fields as Record<string, unknown>;
        const response = await client.post<{ status: string; id: string }>(
          `/obj/${dataType}`,
          fields,
        );
        return successResult({ id: response.id, operation: 'create' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
