import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import type { SearchResponse } from '../../shared/types.js';
import { validateIdentifier } from '../../shared/validation.js';

interface OrphanRecord {
  record_id: string;
  field: string;
  missing_reference: string;
  referenced_type: string;
}

export function createFindOrphansTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_find_orphans',
    mode: 'read-only',
    description:
      'Scans records for broken references (orphaned foreign keys). Samples records and checks that each reference field points to an existing record.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      dataType: z.string().min(1).optional().describe('Optional: restrict scan to a single data type'),
      sample_size: z.number().int().min(1).max(1000).optional().default(200).describe('Number of records to sample per type (default 200)'),
    },
    async handler(args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const sampleSize = (args.sample_size as number | undefined) ?? 200;
        const filterType = args.dataType ? validateIdentifier(args.dataType as string, 'dataType') : undefined;
        const orphans: OrphanRecord[] = [];
        let scannedTypes = 0;
        let apiCalls = 0;
        const MAX_API_CALLS = 500;

        const typesToScan = filterType
          ? filterType in getTypes
            ? [filterType]
            : []
          : Object.keys(getTypes);

        for (const typeName of typesToScan) {
          const fields = getTypes[typeName];
          const refFields: Array<{ fieldName: string; referencedType: string }> = [];

          for (const [fieldName, fieldDef] of Object.entries(fields)) {
            const fieldType: string = fieldDef.type ?? '';
            if (fieldType.startsWith('custom.')) {
              refFields.push({ fieldName, referencedType: fieldType.slice('custom.'.length) });
            }
          }

          if (refFields.length === 0) continue;

          scannedTypes++;
          const response = await client.get<SearchResponse>(
            `/obj/${typeName}?limit=${sampleSize}&cursor=0`,
          );
          const records = response.response?.results ?? [];

          for (const record of records) {
            if (apiCalls >= MAX_API_CALLS) break;
            for (const { fieldName, referencedType } of refFields) {
              if (apiCalls >= MAX_API_CALLS) break;
              const refId = record[fieldName];
              if (!refId || typeof refId !== 'string') continue;

              apiCalls++;
              try {
                await client.get(`/obj/${referencedType}/${refId}`);
              } catch {
                orphans.push({
                  record_id: record._id,
                  field: fieldName,
                  missing_reference: refId,
                  referenced_type: referencedType,
                });
              }
            }
          }
        }

        return successResult({
          scanned_types: scannedTypes,
          orphans,
          total_orphans: orphans.length,
          api_calls_used: apiCalls,
          ...(apiCalls >= MAX_API_CALLS ? { capped: true, message: 'Scan stopped at 500 API calls. Use dataType filter to scan specific types.' } : {}),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
