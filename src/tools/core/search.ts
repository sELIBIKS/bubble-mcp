import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { validateIdentifier } from '../../shared/validation.js';

const ConstraintSchema = z.object({
  key: z.string(),
  constraint_type: z.string(),
  value: z.unknown().optional(),
});

export function createSearchTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_search',
    mode: 'read-only',
    description:
      'Search Bubble.io data objects of a given type with optional constraints, sorting, and pagination.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type name to search (e.g. "user", "order")'),
      constraints: z.array(ConstraintSchema).optional().describe('Array of search constraints'),
      sort_field: z.string().optional().describe('Field name to sort results by'),
      descending: z.boolean().optional().describe('Sort descending when true'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .default(100)
        .describe('Max number of results to return (default 100)'),
      cursor: z.number().optional().default(0).describe('Pagination cursor (default 0)'),
      exclude_remaining: z.boolean().optional().describe('Exclude remaining count from response'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const limit = (args.limit as number | undefined) ?? 100;
        const cursor = (args.cursor as number | undefined) ?? 0;

        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('cursor', String(cursor));

        if (args.constraints) {
          params.set('constraints', JSON.stringify(args.constraints));
        }
        if (args.sort_field) {
          params.set('sort_field', validateIdentifier(args.sort_field as string, 'sort_field'));
        }
        if (args.descending !== undefined) {
          params.set('descending', String(args.descending));
        }
        if (args.exclude_remaining !== undefined) {
          params.set('exclude_remaining', String(args.exclude_remaining));
        }

        const response = await client.get<{ response: unknown }>(
          `/obj/${dataType}?${params.toString()}`,
        );
        return successResult(response.response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
