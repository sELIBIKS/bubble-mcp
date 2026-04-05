import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface TypeSummary {
  name: string;
  fieldCount: number;
  fields: string[];
}

interface Relationship {
  from: string;
  field: string;
  to: string;
}

export function createSchemaSummaryTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_schema_summary',
    mode: 'read-only',
    description:
      'Fetches the Bubble.io schema and returns a human-readable summary: types, field counts, and detected relationships between data types.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};
        const types: TypeSummary[] = [];
        const relationships: Relationship[] = [];
        let totalFields = 0;

        for (const [typeName, fields] of Object.entries(getTypes)) {
          const fieldNames = Object.keys(fields);
          types.push({ name: typeName, fieldCount: fieldNames.length, fields: fieldNames });
          totalFields += fieldNames.length;

          for (const [fieldName, fieldDef] of Object.entries(fields)) {
            const fieldType: string = fieldDef.type ?? '';
            if (fieldType.startsWith('list.custom.')) {
              const referencedType = fieldType.slice('list.custom.'.length);
              relationships.push({ from: typeName, field: fieldName, to: referencedType });
            } else if (fieldType.startsWith('custom.')) {
              const referencedType = fieldType.slice('custom.'.length);
              relationships.push({ from: typeName, field: fieldName, to: referencedType });
            }
          }
        }

        return successResult({
          types,
          relationships,
          total_types: types.length,
          total_fields: totalFields,
          total_relationships: relationships.length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
