import { BubbleApiError } from '../bubble-client.js';
import type { ToolResult } from '../types.js';
import { truncateResponse } from '../shared/constants.js';

function getErrorHint(code: number): string {
  switch (code) {
    case 400:
      return 'Check that all required fields are provided and values match expected types.';
    case 401:
      return 'API token is invalid or expired. Check BUBBLE_API_TOKEN configuration.';
    case 403:
      return 'Permission denied. Verify Bubble privacy rules allow this operation.';
    case 404:
      return 'Resource not found. Verify the data type name and record ID are correct.';
    case 429:
      return 'Rate limit exceeded. Wait a moment and try again, or reduce request frequency.';
    default:
      return 'An unexpected error occurred. Check the Bubble.io logs for details.';
  }
}

export function handleToolError(error: unknown): ToolResult {
  if (error instanceof BubbleApiError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            code: error.code,
            bubble_status: error.bubbleStatus,
            hint: getErrorHint(error.code),
          }),
        },
      ],
      isError: true,
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: message,
          hint: 'An unexpected error occurred. Check server logs.',
        }),
      },
    ],
    isError: true,
  };
}

export function successResult(data: unknown): ToolResult {
  const result = truncateResponse(data);
  if (result.truncated) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: result.data,
            _truncated: result.truncation_message,
          }),
        },
      ],
    };
  }
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}
