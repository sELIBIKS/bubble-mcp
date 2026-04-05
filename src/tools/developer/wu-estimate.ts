import { z } from 'zod';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import type { CountResponse } from '../../shared/types.js';
import { validateIdentifier } from '../../shared/validation.js';

const BASE_WU: Record<string, number> = {
  search: 0.3,
  create: 0.5,
  update: 0.5,
  delete: 0.3,
};

function wuCategory(wu: number): string {
  if (wu <= 0.5) return 'low';
  if (wu <= 1.0) return 'medium';
  if (wu <= 2.0) return 'high';
  return 'expensive';
}

export function createWuEstimateTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_wu_estimate',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Estimates Workload Units (WU) for a Bubble.io operation. Scales search estimates by dataset size and flags expensive patterns.',
    inputSchema: {
      dataType: z.string().min(1).describe('The Bubble data type'),
      operation: z
        .enum(['search', 'create', 'update', 'delete'])
        .describe('The operation to estimate'),
      constraints: z
        .array(z.record(z.unknown()))
        .optional()
        .describe('Optional search constraints'),
    },
    async handler(args) {
      try {
        const dataType = validateIdentifier(args.dataType as string, 'dataType');
        const operation = args.operation as 'search' | 'create' | 'update' | 'delete';
        const constraints = (args.constraints as Record<string, unknown>[] | undefined) ?? [];

        let estimatedRecords = 0;
        let estimatedWu = BASE_WU[operation];
        const suggestions: string[] = [];

        if (operation === 'search') {
          try {
            const countResponse = await client.get<CountResponse>(`/obj/${dataType}?limit=0`);
            const count =
              (countResponse.response?.count ?? 0) + (countResponse.response?.remaining ?? 0);
            estimatedRecords = count;

            if (count > 50_000) {
              estimatedWu *= 3;
              suggestions.push(
                'Dataset is very large (>50k records). Consider using constraints to narrow results.',
              );
            } else if (count > 10_000) {
              estimatedWu *= 2;
              suggestions.push(
                'Dataset is large (>10k records). Ensure you use indexed fields in constraints.',
              );
            }

            // Check for text-contains on large datasets
            const hasTextContains = constraints.some(
              (c) =>
                typeof c.constraint_type === 'string' && c.constraint_type.includes('contains'),
            );
            if (hasTextContains && count > 1000) {
              suggestions.push(
                'Text "contains" constraint on large dataset is expensive. Consider a dedicated search index.',
              );
              estimatedWu *= 1.5;
            }
          } catch {
            // Could not probe count, use base WU
            suggestions.push('Could not probe dataset size. Estimate may be conservative.');
          }
        }

        estimatedWu = Math.round(estimatedWu * 100) / 100;

        return successResult({
          estimated_wu: estimatedWu,
          category: wuCategory(estimatedWu),
          operation,
          dataType,
          estimated_records: estimatedRecords,
          suggestions,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
