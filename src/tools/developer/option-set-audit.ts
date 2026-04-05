import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse, BubbleRecord } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

const UNIQUE_RATIO_THRESHOLD = 0.3;
const MAX_UNIQUE_VALUES = 20;
const SAMPLE_SIZE = 100;
const EXCLUDED_FIELDS = new Set(['_id', 'Created Date', 'Modified Date', 'Created By']);

interface OptionSetCandidate {
  dataType: string;
  field: string;
  unique_values: number;
  total_records: number;
  sample_values: string[];
  reason: string;
}

interface SearchResponse {
  response?: {
    results?: BubbleRecord[];
  };
}

export function createOptionSetAuditTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_option_set_audit',
    mode: 'read-only',
    description:
      'Scans text fields across all data types and identifies fields that should be converted to Bubble option sets based on low cardinality.',
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const candidates: OptionSetCandidate[] = [];

        for (const [typeName, fields] of Object.entries(getTypes)) {
          const textFields = Object.entries(fields)
            .filter(([name, def]) => def.type === 'text' && !EXCLUDED_FIELDS.has(name))
            .map(([name]) => name);

          if (textFields.length === 0) continue;

          let records: BubbleRecord[] = [];
          try {
            const response = await client.get<SearchResponse>(
              `/obj/${typeName}?limit=${SAMPLE_SIZE}&cursor=0`
            );
            records = response.response?.results ?? [];
          } catch {
            continue;
          }

          if (records.length === 0) continue;

          for (const fieldName of textFields) {
            const values = records
              .map(r => r[fieldName])
              .filter(v => v !== null && v !== undefined && v !== '') as string[];

            if (values.length === 0) continue;

            const uniqueSet = new Set(values);
            const uniqueCount = uniqueSet.size;
            const uniqueRatio = uniqueCount / values.length;

            if (uniqueRatio < UNIQUE_RATIO_THRESHOLD && uniqueCount <= MAX_UNIQUE_VALUES) {
              candidates.push({
                dataType: typeName,
                field: fieldName,
                unique_values: uniqueCount,
                total_records: records.length,
                sample_values: Array.from(uniqueSet).slice(0, 5),
                reason: `Only ${uniqueCount} unique values in ${values.length} sampled records (${Math.round(uniqueRatio * 100)}% unique ratio)`,
              });
            }
          }
        }

        return successResult({
          should_be_option_sets: candidates,
          total_candidates: candidates.length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
