import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse, BubbleRecord } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface OrphanRecord {
  record_id: string;
  field: string;
  missing_reference: string;
  referenced_type: string;
}

interface SearchResponse {
  response: {
    cursor: number;
    count: number;
    remaining: number;
    results: BubbleRecord[];
  };
}

export function createFindOrphansTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_find_orphans',
    mode: 'read-only',
    description: 'Scans records for broken references (orphaned foreign keys). Samples records and checks that each reference field points to an existing record.',
    inputSchema: {
      dataType: { type: 'string', description: 'Optional: restrict scan to a single data type' },
      sample_size: { type: 'number', description: 'Number of records to sample per type (default 200)' },
    },
    async handler(args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const sampleSize = (args.sample_size as number | undefined) ?? 200;
        const filterType = args.dataType as string | undefined;
        const orphans: OrphanRecord[] = [];
        let scannedTypes = 0;

        const typesToScan = filterType
          ? (filterType in getTypes ? [filterType] : [])
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
            `/obj/${typeName}?limit=${sampleSize}&cursor=0`
          );
          const records = response.response?.results ?? [];

          for (const record of records) {
            for (const { fieldName, referencedType } of refFields) {
              const refId = record[fieldName];
              if (!refId || typeof refId !== 'string') continue;

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
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
