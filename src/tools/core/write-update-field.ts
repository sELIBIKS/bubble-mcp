import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createUpdateFieldTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_update_field',
    mode: 'read-write',
    description:
      'Update properties of a field on a Bubble data type (rename, change type, toggle list). Uses the editor API to modify the field in place.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('Data type containing the field (display name)'),
      field_name: z.string().min(1).describe('Current field display name to update'),
      new_name: z.string().optional().describe('New display name for the field'),
      new_type: z
        .enum(['text', 'number', 'yes_no', 'date', 'geographic_address', 'image', 'file'])
        .optional()
        .describe('New field type (WARNING: may cause data loss)'),
      is_list: z.boolean().optional().describe('Change list flag'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const fieldName = args.field_name as string;
      const newName = args.new_name as string | undefined;
      const newType = args.new_type as string | undefined;
      const isList = args.is_list as boolean | undefined;

      const def = await loadAppDefinition(editorClient);
      const allTypes = def.getDataTypes();

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

      const deepFields = matched.deepFields || [];
      const field = deepFields.find(
        (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
      );

      if (!field) {
        const available = deepFields.map((f) => f.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Field "${fieldName}" not found on type "${matched.name}"`,
                hint: `Available fields: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Build updated body from current values, overriding with provided values
      const body: Record<string, unknown> = {
        '%d': newName ?? field.name,
        '%t': newType ?? field.fieldType,
        '%o': isList ?? field.isList,
      };

      const changes: Record<string, unknown> = {};
      if (newName !== undefined) changes.name = newName;
      if (newType !== undefined) changes.type = newType;
      if (isList !== undefined) changes.isList = isList;

      const writeResult = await editorClient.write([
        {
          body,
          pathArray: ['user_types', matched.key, '%f3', field.key],
        },
      ]);

      return successResult({
        updated: {
          typeName: matched.name,
          fieldKey: field.key,
          changes,
        },
        writeResult,
      });
    },
  };
}
