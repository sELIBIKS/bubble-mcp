import { BubbleApiError } from '../bubble-client.js';
import type { ToolResult } from '../types.js';

export function handleToolError(error: unknown): ToolResult {
  if (error instanceof BubbleApiError) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: false,
        error: { code: error.code, message: error.message, bubble_status: error.bubbleStatus },
      }) }],
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code: 500, message } }) }],
    isError: true,
  };
}

export function successResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, data }) }] };
}
