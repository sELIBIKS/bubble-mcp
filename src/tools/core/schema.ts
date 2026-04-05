import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createSchemaTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_get_schema',
    mode: 'read-only',
    description:
      'Retrieve the full Bubble.io app schema from the /meta endpoint, listing all data types and their fields.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get('/meta');
        return successResult(schema);
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
