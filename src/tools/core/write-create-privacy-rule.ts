import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildExpression, buildComparison } from '../../shared/expression-builder.js';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function parsePrivacyCondition(condition: string): Record<string, unknown> {
  const binaryOps = ['equals', 'is_not', 'contains', 'greater than', 'less than'];
  for (const op of binaryOps) {
    const idx = condition.lastIndexOf(` ${op} `);
    if (idx !== -1) {
      const subject = condition.slice(0, idx);
      const argument = condition.slice(idx + op.length + 2);
      return buildComparison(subject, op, argument);
    }
  }

  const unaryOps = ['is_not_empty', 'is_empty'];
  for (const op of unaryOps) {
    if (condition.endsWith(` ${op}`)) {
      const subject = condition.slice(0, -(op.length + 1));
      return buildComparison(subject, op);
    }
  }

  return buildExpression(condition);
}

export function createCreatePrivacyRuleTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_privacy_rule',
    mode: 'read-write',
    description:
      'Create a privacy rule on a data type. Controls who can view, search, modify, and delete records.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      data_type: z.string().min(1).describe('Data type name to add the privacy rule to'),
      rule_name: z.string().min(1).describe('Human-readable name for the rule'),
      permissions: z
        .object({
          view_all: z.boolean().optional().describe('Can view all fields (default true)'),
          search_for: z.boolean().optional().describe('Can search for records (default false)'),
          auto_binding: z.boolean().optional().describe('Auto-binding enabled (default false)'),
          modify_api: z.boolean().optional().describe('Can modify via API (default false)'),
          delete_api: z.boolean().optional().describe('Can delete via API (default false)'),
          create_api: z.boolean().optional().describe('Can create via API (default false)'),
        })
        .optional()
        .describe('Permission flags (defaults: view_all=true, rest=false)'),
      condition: z
        .string()
        .optional()
        .describe(
          "Condition expression in DSL format. Example: \"This Thing's creator equals Current User\"",
        ),
    },
    async handler(args) {
      const dataTypeName = args.data_type as string;
      const ruleName = args.rule_name as string;
      const permissions = (args.permissions as Record<string, boolean> | undefined) ?? {};
      const condition = args.condition as string | undefined;

      const def = await loadAppDefinition(editorClient);
      const types = def.getDataTypes();
      const matched = types.find(
        (t) => t.name.toLowerCase() === dataTypeName.toLowerCase(),
      );

      if (!matched) {
        const available = types.map((t) => t.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Data type "${dataTypeName}" not found`,
                hint: `Available types: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const roleKey = generateId();

      const resolvedPermissions = {
        view_all: permissions.view_all ?? true,
        search_for: permissions.search_for ?? false,
        auto_binding: permissions.auto_binding ?? false,
        modify_api: permissions.modify_api ?? false,
        delete_api: permissions.delete_api ?? false,
        create_api: permissions.create_api ?? false,
      };

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: {
            '%d': ruleName,
            permissions: resolvedPermissions,
          },
          pathArray: ['user_types', matched.key, 'privacy_role', roleKey],
        },
      ];

      if (condition) {
        const conditionExpr = parsePrivacyCondition(condition);
        changes.push({
          body: conditionExpr,
          pathArray: ['user_types', matched.key, 'privacy_role', roleKey, '%c'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          dataType: matched.name,
          dataTypeKey: matched.key,
          roleKey,
          ruleName,
          permissions: resolvedPermissions,
          ...(condition ? { condition } : {}),
        },
        writeResult,
      });
    },
  };
}
