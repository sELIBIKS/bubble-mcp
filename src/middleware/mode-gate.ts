import type { ToolDefinition, ServerMode, ToolMode } from '../types.js';

const MODE_HIERARCHY: Record<ServerMode, ToolMode[]> = {
  'read-only': ['read-only'],
  'read-write': ['read-only', 'read-write'],
  'admin': ['read-only', 'read-write', 'admin'],
};

export function filterToolsByMode(tools: ToolDefinition[], serverMode: ServerMode): ToolDefinition[] {
  const allowedModes = MODE_HIERARCHY[serverMode];
  return tools.filter(tool => allowedModes.includes(tool.mode));
}
