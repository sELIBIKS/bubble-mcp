export type ServerMode = 'read-only' | 'read-write' | 'admin';
export type Environment = 'development' | 'live';
export type ToolMode = 'read-only' | 'read-write' | 'admin';

export interface BubbleConfig {
  appUrl: string;
  apiToken: string;
  mode: ServerMode;
  environment: Environment;
  rateLimit: number;
}

export interface BubbleResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: BubbleError;
}

export interface BubbleError {
  code: number;
  message: string;
  bubbleStatus?: string;
}

export interface BubbleSearchResponse {
  cursor: number;
  count: number;
  remaining: number;
  results: BubbleRecord[];
}

export interface BubbleRecord {
  _id: string;
  'Created Date': string;
  'Modified Date': string;
  'Created By'?: string;
  [key: string]: unknown;
}

export interface BubbleSchemaResponse {
  get: Record<string, BubbleDataType>;
  post: Record<string, BubbleDataType>;
  patch: Record<string, BubbleDataType>;
  delete: Record<string, BubbleDataType>;
}

export interface BubbleDataType {
  [fieldName: string]: BubbleFieldDef;
}

export interface BubbleFieldDef {
  type: string;
  display?: string;
}

export interface Constraint {
  key: string;
  constraint_type: string;
  value?: unknown;
}

export interface ToolDefinition {
  name: string;
  mode: ToolMode;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface SeedTracker {
  seededIds: Map<string, string[]>;
  set(dataType: string, ids: string[]): void;
  get(dataType: string): string[];
  clear(): void;
}
