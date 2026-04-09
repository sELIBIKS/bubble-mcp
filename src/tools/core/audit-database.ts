import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditDatabaseTool(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return createCategoryAuditTool('database', 'bubble_audit_database', 'Database design review — checks for missing option sets, missing reverse relationships, missing Created By fields, and text search performance risks. Returns score and findings.', editorClient, client);
}
