import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createBulkCreateTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_bulk_create',
    mode: 'admin',
    description: 'Create multiple Bubble.io records in a single request. Maximum 1000 records per call.',
    inputSchema: {
      dataType: z.string().describe('The Bubble data type name (e.g. "user", "order")'),
      records: z.array(z.record(z.unknown())).describe('Array of field objects to create. Maximum 1000 records.'),
    },
    async handler(args) {
      try {
        const dataType = args.dataType as string;
        const records = args.records as Record<string, unknown>[];

        if (records.length > 1000) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: { code: 400, message: 'Bulk create limit exceeded: maximum 1000 records per request.' },
              }),
            }],
            isError: true,
          };
        }

        const raw = await client.postBulk(`/obj/${dataType}/bulk`, records);
        const results = raw
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => JSON.parse(line) as { status: string; id: string });

        return successResult({ total: records.length, results, operation: 'bulk_create' });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
