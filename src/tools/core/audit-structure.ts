import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditStructureTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool('structure', 'bubble_audit_structure', 'App structure audit — checks for empty pages, oversized types, tiny option sets, and pages without workflows. Returns score and findings.', editorClient);
}
