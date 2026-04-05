import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

export function createExportSchemaTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_export_schema',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Exports the Bubble.io schema as TDD-format markdown, including an entity summary table and detailed field specifications.',
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const getTypes = schema.get ?? {};

        const lines: string[] = ['# Data Architecture', ''];
        lines.push('| Entity | Description | Key Relationships |');
        lines.push('|--------|-------------|-------------------|');

        for (const [typeName, fields] of Object.entries(getTypes)) {
          const fieldCount = Object.keys(fields).length;
          const relationships = Object.entries(fields)
            .filter(([, def]) => def.type?.startsWith('custom.'))
            .map(([fieldName, def]) => `${fieldName} -> ${def.type.slice('custom.'.length)}`)
            .join(', ');
          lines.push(`| **${typeName}** | ${fieldCount} fields | ${relationships || 'none'} |`);
        }

        lines.push('');
        lines.push('## Detailed Field Specifications');
        lines.push('');

        for (const [typeName, fields] of Object.entries(getTypes)) {
          lines.push(`**${typeName}:**`);
          for (const [fieldName, fieldDef] of Object.entries(fields)) {
            lines.push(`- ${fieldName} (${fieldDef.type})`);
          }
          lines.push('');
        }

        return successResult({ markdown: lines.join('\n') });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
