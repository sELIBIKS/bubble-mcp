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

export interface EditorConfig {
  appId: string;
  version: string; // 'test', 'live', or a branch ID (e.g. '634ss')
  cookieHeader: string;
  hashNonces?: Record<string, string>; // path_version_hash → nonce (for branch data loading)
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


export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  mode: ToolMode;
  description: string;
  annotations: ToolAnnotations;
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
