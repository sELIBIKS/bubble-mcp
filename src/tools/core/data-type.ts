import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { expressionToString } from '../../auth/expression-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createDataTypeTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_data_type',
    mode: 'read-only',
    description:
      'Get detailed information about a specific data type from the Bubble editor, including fields, deep fields (%f3), and privacy rules with human-readable expressions. Use bubble_get_app_structure to discover available type names first.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('The data type display name (e.g. "User", "Message")'),
      include_privacy_expressions: z
        .boolean()
        .optional()
        .describe('Include raw Bubble expression objects for privacy rules (default false)'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const includeExpressions = (args.include_privacy_expressions as boolean) || false;

      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);
      const allTypes = def.getDataTypes();

      // Match by display name (case-insensitive)
      const matched = allTypes.find(
        (t) => t.name.toLowerCase() === typeName.toLowerCase(),
      );

      if (!matched) {
        const available = allTypes.map((t) => t.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Data type "${typeName}" not found`,
                hint: `Available types: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Parse privacy rules into human-readable strings
      const privacyRules: Record<string, Record<string, string>> = {};
      const privacyRulesRaw: Record<string, Record<string, unknown>> = {};

      for (const [roleName, roleData] of Object.entries(matched.privacyRoles)) {
        const roleObj = (roleData || {}) as Record<string, unknown>;
        privacyRules[roleName] = {};
        privacyRulesRaw[roleName] = {};

        for (const [permission, expr] of Object.entries(roleObj)) {
          const readable = expressionToString(expr);
          privacyRules[roleName][permission] = readable || JSON.stringify(expr);
          privacyRulesRaw[roleName][permission] = expr;
        }
      }

      return successResult({
        name: matched.name,
        key: matched.key,
        fields: matched.fields,
        deepFields: matched.deepFields || [],
        privacyRules,
        ...(includeExpressions ? { privacyRulesRaw } : {}),
      });
    },
  };
}
