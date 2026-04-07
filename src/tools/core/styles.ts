import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createStylesTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_styles',
    mode: 'read-only',
    description:
      'List shared style definitions from the Bubble editor. Optionally filter by element type (e.g., "Button", "Text").',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      element_type: z
        .string()
        .optional()
        .describe('Filter styles by element type (e.g., "Button", "Text")'),
    },
    async handler(args) {
      const elementType = args.element_type as string | undefined;
      const def = await loadAppDefinition(editorClient);
      const allStyles = def.getStyles();

      if (!allStyles || allStyles.length === 0) {
        return successResult({
          styles: [],
          count: 0,
          note: 'No custom styles defined in this app',
        });
      }

      let styles = allStyles.map((s) => ({
        name: s.name,
        key: s.key,
        elementType: s.elementType,
        properties: s.properties,
      }));

      if (elementType) {
        const filterLower = elementType.toLowerCase();
        styles = styles.filter((s) => s.elementType.toLowerCase() === filterLower);
      }

      return successResult({
        styles,
        count: styles.length,
      });
    },
  };
}
