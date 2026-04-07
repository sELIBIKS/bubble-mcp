import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createAppStructureTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_app_structure',
    mode: 'read-only',
    description:
      'Fetch the full app structure from the Bubble editor: data types (with privacy rules and fields), option sets, pages, and settings. Uses the editor session (requires prior auth). Set detail to "full" for complete definitions or "summary" (default) for counts and names only.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      detail: z.enum(['summary', 'full']).optional().describe('Level of detail: "summary" (default) or "full"'),
    },
    async handler(args) {
      const detail = (args.detail as string) || 'summary';
      const def = await loadAppDefinition(editorClient);

      if (detail === 'full') {
        return successResult({
          summary: def.getSummary(),
          dataTypes: def.getDataTypes(),
          optionSets: def.getOptionSets(),
          pages: def.getPageNames(),
          settings: def.getSettings(),
        });
      }

      return successResult({ summary: def.getSummary() });
    },
  };
}
