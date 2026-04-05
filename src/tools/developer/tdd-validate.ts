import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { parseTdd } from './tdd-parser.js';
import { validateFilePath } from '../../shared/validation.js';

export function createTddValidateTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_tdd_validate',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      'Validates a TDD markdown file against the live Bubble.io schema. Reports missing types, missing fields, type mismatches, and extra fields.',
    inputSchema: {
      tdd_path: z.string().min(1).describe('Path to the TDD markdown file'),
    },
    async handler(args) {
      try {
        const tddPath = validateFilePath(args.tdd_path as string);
        const tddTypes = parseTdd(tddPath);

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const liveTypes = schema.get ?? {};

        const missingTypes: string[] = [];
        const missingFields: Array<{ type: string; field: string }> = [];
        const typeMismatches: Array<{
          type: string;
          field: string;
          expected: string;
          actual: string;
        }> = [];
        const extraFields: Array<{ type: string; field: string }> = [];

        for (const tddType of tddTypes) {
          if (!(tddType.name in liveTypes)) {
            missingTypes.push(tddType.name);
            continue;
          }

          const liveFields = liveTypes[tddType.name];

          for (const tddField of tddType.fields) {
            if (!(tddField.name in liveFields)) {
              missingFields.push({ type: tddType.name, field: tddField.name });
            } else {
              const liveType = liveFields[tddField.name].type;
              if (liveType !== tddField.type) {
                typeMismatches.push({
                  type: tddType.name,
                  field: tddField.name,
                  expected: tddField.type,
                  actual: liveType,
                });
              }
            }
          }

          // Detect extra fields in live that are not in TDD
          const tddFieldNames = new Set(tddType.fields.map((f) => f.name));
          for (const liveFieldName of Object.keys(liveFields)) {
            if (!tddFieldNames.has(liveFieldName)) {
              extraFields.push({ type: tddType.name, field: liveFieldName });
            }
          }
        }

        const totalChecks = tddTypes.reduce((sum, t) => sum + t.fields.length, 0);
        const issues = missingTypes.length + missingFields.length + typeMismatches.length;
        const conformancePercent =
          totalChecks > 0 ? Math.round(((totalChecks - issues) / totalChecks) * 100) : 100;

        return successResult({
          conformance_percent: conformancePercent,
          missing_types: missingTypes,
          missing_fields: missingFields,
          type_mismatches: typeMismatches,
          extra_fields: extraFields,
          tdd_types_count: tddTypes.length,
          live_types_count: Object.keys(liveTypes).length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
