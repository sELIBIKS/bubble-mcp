import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditDeadCodeTool(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return createCategoryAuditTool('dead-code', 'bubble_audit_dead_code', 'Unused code detection — checks for unused types, empty fields (via Data API sampling), empty workflows, and orphan pages. Returns score and findings.', editorClient, client);
}
