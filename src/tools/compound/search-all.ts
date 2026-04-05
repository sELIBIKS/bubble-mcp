import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleRecord } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import type { SearchResponse } from '../../shared/types.js';
import { validateIdentifier } from '../../shared/validation.js';

const PAGE_SIZE = 100;
const DEFAULT_MAX_RECORDS = 1000;
const HARD_MAX_RECORDS = 10000;

export function createSearchAllTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_search_all',
    mode: 'read-only',
    description:
      'Auto-paginates through all records of a Bubble data type, up to a configurable max. Returns combined results with a capped flag if the limit was hit.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type to search'),
      constraints: z.array(z.record(z.unknown())).optional().describe('Optional search constraints'),
      sort_field: z.string().optional().describe('Field to sort by'),
      descending: z.boolean().optional().describe('Sort descending when true'),
      max_records: z.number().int().min(1).max(10000).optional().default(1000).describe(`Max records to return (default 1000, max 10000)`),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const maxRecords = Math.min(
          (args.max_records as number | undefined) ?? DEFAULT_MAX_RECORDS,
          HARD_MAX_RECORDS,
        );

        const baseParams = new URLSearchParams();
        baseParams.set('limit', String(PAGE_SIZE));

        if (args.constraints) {
          baseParams.set('constraints', JSON.stringify(args.constraints));
        }
        if (args.sort_field) {
          baseParams.set('sort_field', validateIdentifier(args.sort_field as string, 'sort_field'));
        }
        if (args.descending !== undefined) {
          baseParams.set('descending', String(args.descending));
        }

        const allResults: BubbleRecord[] = [];
        let cursor = 0;
        let capped = false;

        while (true) {
          const params = new URLSearchParams(baseParams);
          params.set('cursor', String(cursor));

          const response = await client.get<SearchResponse>(
            `/obj/${dataType}?${params.toString()}`,
          );
          const page = response.response;
          const pageResults = page.results ?? [];

          const remaining = maxRecords - allResults.length;
          if (pageResults.length > remaining) {
            allResults.push(...pageResults.slice(0, remaining));
            capped = true;
            break;
          }

          allResults.push(...pageResults);

          if (allResults.length >= maxRecords) {
            capped = page.remaining > 0;
            break;
          }

          if (page.remaining <= 0) break;

          cursor += PAGE_SIZE;
        }

        return successResult({
          results: allResults,
          total: allResults.length,
          capped,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
