import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { parseTdd, TddType } from './tdd-parser.js';
import { topologicalSort } from '../../shared/graph.js';
import { validateFilePath } from '../../shared/validation.js';

interface MigrationStep {
  order: number;
  action: 'add_field' | 'create_type' | 'remove_field';
  target: string;
  details: string;
}

export function createMigrationPlanTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_migration_plan',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      'Generates an ordered migration plan comparing a target TDD file against the live Bubble.io schema. Produces add_field, create_type, and remove_field steps.',
    inputSchema: {
      tdd_path: z.string().min(1).describe('Path to the target TDD markdown file'),
    },
    async handler(args) {
      try {
        const tddPath = validateFilePath(args.tdd_path as string);
        const tddTypes = parseTdd(tddPath);

        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const liveTypes = schema.get ?? {};

        const steps: MigrationStep[] = [];
        let order = 1;

        // Phase 1: add_fields to existing types
        for (const tddType of tddTypes) {
          if (!(tddType.name in liveTypes)) continue;
          const liveFields = liveTypes[tddType.name];
          for (const field of tddType.fields) {
            if (!(field.name in liveFields)) {
              steps.push({
                order: order++,
                action: 'add_field',
                target: tddType.name,
                details: `Add field "${field.name}" (${field.type})`,
              });
            }
          }
        }

        // Phase 2: create_type for new types (topological order)
        const newTypes = tddTypes.filter((t) => !(t.name in liveTypes));
        const sorted = topologicalSort(newTypes);
        for (const t of sorted) {
          steps.push({
            order: order++,
            action: 'create_type',
            target: t.name,
            details: `Create type "${t.name}" with ${t.fields.length} fields: ${t.fields.map((f) => `${f.name} (${f.type})`).join(', ')}`,
          });
        }

        // Phase 3: flag remove_fields (live fields not in TDD)
        for (const tddType of tddTypes) {
          if (!(tddType.name in liveTypes)) continue;
          const liveFields = liveTypes[tddType.name];
          const tddFieldNames = new Set(tddType.fields.map((f) => f.name));
          for (const liveFieldName of Object.keys(liveFields)) {
            if (!tddFieldNames.has(liveFieldName)) {
              steps.push({
                order: order++,
                action: 'remove_field',
                target: tddType.name,
                details: `[FLAG ONLY] Field "${liveFieldName}" exists in live but not in TDD — verify before removing`,
              });
            }
          }
        }

        const summary = {
          add_fields: steps.filter((s) => s.action === 'add_field').length,
          create_types: steps.filter((s) => s.action === 'create_type').length,
          remove_fields_flagged: steps.filter((s) => s.action === 'remove_field').length,
        };

        return successResult({
          steps,
          total_steps: steps.length,
          summary,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
