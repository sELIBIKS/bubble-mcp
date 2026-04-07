import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { parsePageWorkflows } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageWorkflowsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_workflows',
    mode: 'read-only',
    description:
      'Get all workflows on a specific page with their events, actions, and conditions. Conditions are shown as human-readable strings by default. Set include_expressions=true to also include raw Bubble expression objects. Optionally filter by event type.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
      event_type: z
        .string()
        .optional()
        .describe('Filter by event type (e.g. "PageLoaded", "ButtonClicked")'),
      include_expressions: z
        .boolean()
        .optional()
        .describe('Include raw Bubble expression objects alongside human-readable strings (default false)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const eventType = args.event_type as string | undefined;
      const includeExpressions = (args.include_expressions as boolean) || false;

      // Resolve page
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);
      const pagePath = def.resolvePagePath(pageName);
      const pageId = def.resolvePageId(pageName);

      if (!pageId) {
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

      // Load workflow subtree
      let workflows: ReturnType<typeof parsePageWorkflows> = [];
      if (pagePath) {
        const wfResult = await editorClient.loadPaths([[pagePath, '%wf']]);
        const wfData = wfResult.data?.[0]?.data;
        workflows = parsePageWorkflows(wfData);
      }

      // Apply event type filter
      const filtered = eventType
        ? workflows.filter((wf) => wf.eventType === eventType)
        : workflows;

      return successResult({
        page: pageName,
        workflows: filtered.map((wf) => ({
          id: wf.id,
          eventType: wf.eventType,
          actions: wf.actions.map((a) => ({
            type: a.type,
            properties: a.properties,
          })),
          condition: wf.conditionReadable,
          ...(includeExpressions && wf.condition ? { conditionRaw: wf.condition } : {}),
        })),
        count: filtered.length,
        ...(eventType ? { filter: eventType } : {}),
      });
    },
  };
}
