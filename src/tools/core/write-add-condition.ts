import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildExpression, buildComparison } from '../../shared/expression-builder.js';

/** Map human-readable property names to Bubble internal keys */
const PROPERTY_MAP: Record<string, string> = {
  visible: '%iv',
  background_color: '%bgc',
  font_color: '%fc',
  font_size: '%fs',
  border_color: '%bdc',
  border_width: '%bdw',
  opacity: '%op',
  width: '%w',
  height: '%h',
};

function parseCondition(condition: string): Record<string, unknown> {
  const unaryOps = ['is_not_empty', 'is_empty'];
  for (const op of unaryOps) {
    if (condition.endsWith(` ${op}`)) {
      const subject = condition.slice(0, -(op.length + 1));
      return buildComparison(subject, op);
    }
  }

  const binaryOps = ['equals', 'is_not', 'contains', 'greater than', 'less than'];
  for (const op of binaryOps) {
    const idx = condition.lastIndexOf(` ${op} `);
    if (idx !== -1) {
      const subject = condition.slice(0, idx);
      const argument = condition.slice(idx + op.length + 2);
      return buildComparison(subject, op, argument);
    }
  }

  return buildExpression(condition);
}

export function createAddConditionTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_add_condition',
    mode: 'read-write',
    description:
      'Add a conditional state to an existing element. Conditions change element properties (visibility, colors, etc.) when an expression is true.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page containing the element'),
      element_id: z.string().min(1).describe('Element ID to add the condition to'),
      condition: z
        .string()
        .min(1)
        .describe(
          'Condition expression in DSL format. Examples: "Current User\'s logged_in equals yes", "Current User\'s email is_not_empty", "This Thing\'s count greater than 0"',
        ),
      property: z
        .enum([
          'visible',
          'background_color',
          'font_color',
          'font_size',
          'border_color',
          'border_width',
          'opacity',
          'width',
          'height',
        ])
        .describe('Property to change when condition is true'),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe('Value to set when condition is true'),
      state_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Condition slot index (default 0). Use 1, 2, etc. for additional conditions.'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementId = args.element_id as string;
      const condition = args.condition as string;
      const property = args.property as string;
      const value = args.value as string | number | boolean;
      const stateIndex = String((args.state_index as number | undefined) ?? 0);

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const pathId = pagePath.split('.')[1];
      const propertyKey = PROPERTY_MAP[property] || property;
      const conditionExpr = parseCondition(condition);

      const writeResult = await editorClient.write([
        {
          body: { [stateIndex]: { '%x': 'State', '%c': null, '%p': null } },
          pathArray: ['%p3', pathId, '%el', elementId, '%s'],
        },
        {
          body: conditionExpr,
          pathArray: ['%p3', pathId, '%el', elementId, '%s', stateIndex, '%c'],
        },
        {
          body: value,
          pathArray: ['%p3', pathId, '%el', elementId, '%s', stateIndex, '%p', propertyKey],
        },
      ]);

      return successResult({
        created: {
          pageName,
          elementId,
          stateIndex: Number(stateIndex),
          condition,
          property,
          propertyKey,
          value,
        },
        writeResult,
      });
    },
  };
}
