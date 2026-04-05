import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import type { CountResponse } from '../../shared/types.js';

const CATEGORICAL_PATTERNS = ['status', 'state', 'type', 'category', 'role', 'level'];
const FK_MIN_RECORDS = 500;
const DATE_MIN_RECORDS = 2000;
const CATEGORICAL_MIN_RECORDS = 500;

interface IndexSuggestion {
  dataType: string;
  field: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

function priorityOrder(p: string): number {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}

export function createSuggestIndexesTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_suggest_indexes',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Analyses the Bubble.io schema and record counts to suggest fields that would benefit from database indexes.',
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const suggestions: IndexSuggestion[] = [];

        for (const [typeName, fields] of Object.entries(getTypes)) {
          let recordCount = 0;
          try {
            const countResponse = await client.get<CountResponse>(`/obj/${typeName}?limit=0`);
            recordCount =
              (countResponse.response?.count ?? 0) + (countResponse.response?.remaining ?? 0);
          } catch (err) {
            // Cannot probe record count for this type, skip
            continue;
          }

          if (recordCount < FK_MIN_RECORDS) continue;

          for (const [fieldName, fieldDef] of Object.entries(fields)) {
            const fieldType = fieldDef.type ?? '';
            const lower = fieldName.toLowerCase();

            // FK fields on large types
            if (fieldType.startsWith('custom.') && recordCount >= FK_MIN_RECORDS) {
              suggestions.push({
                dataType: typeName,
                field: fieldName,
                reason: `Foreign key to "${fieldType.slice('custom.'.length)}" on a type with ${recordCount} records`,
                priority: 'high',
              });
            }

            // Date fields on large types
            if (
              (fieldType === 'date' || lower.includes('date') || lower.includes('_at')) &&
              recordCount >= DATE_MIN_RECORDS
            ) {
              suggestions.push({
                dataType: typeName,
                field: fieldName,
                reason: `Date field on a type with ${recordCount} records — useful for time-range queries`,
                priority: 'medium',
              });
            }

            // Categorical text fields
            if (
              fieldType === 'text' &&
              CATEGORICAL_PATTERNS.some((p) => lower.includes(p)) &&
              recordCount >= CATEGORICAL_MIN_RECORDS
            ) {
              suggestions.push({
                dataType: typeName,
                field: fieldName,
                reason: `Categorical field on a type with ${recordCount} records — frequently used in filters`,
                priority: 'low',
              });
            }
          }
        }

        suggestions.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

        return successResult({ suggestions, total: suggestions.length });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
