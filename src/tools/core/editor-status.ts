import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { successResult } from '../../middleware/error-handler.js';

export function createEditorStatusTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_editor_status',
    mode: 'read-only',
    description:
      'Check if the editor session is connected and valid. Returns the app ID, connection status, and version. If disconnected, provides instructions for re-authentication.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {},
    async handler(_args) {
      const connected = await editorClient.validateSession();
      if (connected) {
        return successResult({
          connected: true,
          app_id: editorClient.appId,
          version: editorClient.version,
        });
      }
      return successResult({
        connected: false,
        app_id: editorClient.appId,
        hint: 'Session expired or invalid. Run: bubble-mcp auth login ' + editorClient.appId,
      });
    },
  };
}
