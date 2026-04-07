import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function toFieldKey(name: string, type: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `${slug}_${type}`;
}

export function createCreateFieldTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_field',
    mode: 'read-write',
    description:
      'Add a new field to an existing data type in the Bubble editor. Requires editor auth. Use bubble_get_data_type or bubble_get_app_structure to discover available type names first.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('Data type to add the field to (display name)'),
      field_name: z.string().min(1).describe('Display name for the new field'),
      field_type: z
        .enum(['text', 'number', 'yes_no', 'date', 'geographic_address', 'image', 'file'])
        .describe('Field data type'),
      is_list: z
        .boolean()
        .optional()
        .describe('Whether this field holds a list of values (default false)'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const fieldName = args.field_name as string;
      const fieldType = args.field_type as string;
      const isList = (args.is_list as boolean) ?? false;

      const def = await loadAppDefinition(editorClient);
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

      // Check if field already exists in deep fields
      const existingField = (matched.deepFields || []).find(
        (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
      );

      if (existingField) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Field "${fieldName}" already exists on type "${matched.name}"`,
                existingField: {
                  key: existingField.key,
                  name: existingField.name,
                  fieldType: existingField.fieldType,
                  isList: existingField.isList,
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const fieldKey = toFieldKey(fieldName, fieldType);

      const writeResult = await editorClient.write([
        {
          body: { '%d': fieldName, '%t': fieldType, '%o': isList },
          pathArray: ['user_types', matched.key, '%f3', fieldKey],
        },
      ]);

      return successResult({
        created: {
          typeName: matched.name,
          fieldName,
          fieldKey,
          fieldType,
          isList,
        },
        writeResult,
      });
    },
  };
}
