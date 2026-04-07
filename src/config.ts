import { readFileSync, existsSync } from 'node:fs';
import { createSessionManager } from './auth/session-manager.js';
import type { BubbleConfig, ServerMode, Environment, EditorConfig } from './types.js';

const VALID_MODES: ServerMode[] = ['read-only', 'read-write', 'admin'];
const VALID_ENVIRONMENTS: Environment[] = ['development', 'live'];

interface ConfigFile {
  app_url: string;
  api_token: string;
  mode?: string;
  environment?: string;
  rate_limit?: number;
}

export function loadConfig(): BubbleConfig {
  const configPath = process.env.BUBBLE_CONFIG_PATH;
  if (configPath && existsSync(configPath)) return loadFromFile(configPath);
  if (!configPath && existsSync('./bubble.config.json'))
    return loadFromFile('./bubble.config.json');
  return loadFromEnv();
}

function loadFromFile(filePath: string): BubbleConfig {
  const file: ConfigFile = JSON.parse(readFileSync(filePath, 'utf-8'));
  return buildConfig(file.app_url, file.api_token, file.mode, file.environment, file.rate_limit);
}

function loadFromEnv(): BubbleConfig {
  return buildConfig(
    process.env.BUBBLE_APP_URL,
    process.env.BUBBLE_API_TOKEN,
    process.env.BUBBLE_MODE,
    process.env.BUBBLE_ENVIRONMENT,
    process.env.BUBBLE_RATE_LIMIT ? Number(process.env.BUBBLE_RATE_LIMIT) : undefined,
  );
}

export function loadEditorConfig(config: BubbleConfig): EditorConfig | null {
  const appId = extractAppId(config.appUrl);
  if (!appId) return null;

  const mgr = createSessionManager();
  const cookieHeader = mgr.getCookieHeader(appId);
  if (!cookieHeader) return null;

  return {
    appId,
    version: config.environment === 'development' ? 'test' : 'live',
    cookieHeader,
  };
}

function extractAppId(appUrl: string): string | null {
  const match = appUrl.match(/https?:\/\/([^.]+)\.bubbleapps\.io/);
  return match?.[1] ?? null;
}

function buildConfig(
  appUrl?: string,
  apiToken?: string,
  mode?: string,
  environment?: string,
  rateLimit?: number,
): BubbleConfig {
  if (!appUrl) throw new Error('BUBBLE_APP_URL is required');
  if (!apiToken) throw new Error('BUBBLE_API_TOKEN is required');

  const resolvedMode = mode || 'read-only';
  if (!VALID_MODES.includes(resolvedMode as ServerMode)) {
    throw new Error(
      `BUBBLE_MODE must be one of: ${VALID_MODES.join(', ')}. Got: "${resolvedMode}"`,
    );
  }

  const resolvedEnv = environment || 'development';
  if (!VALID_ENVIRONMENTS.includes(resolvedEnv as Environment)) {
    throw new Error(
      `BUBBLE_ENVIRONMENT must be one of: ${VALID_ENVIRONMENTS.join(', ')}. Got: "${resolvedEnv}"`,
    );
  }

  return {
    appUrl: appUrl.replace(/\/+$/, ''),
    apiToken,
    mode: resolvedMode as ServerMode,
    environment: resolvedEnv as Environment,
    rateLimit: rateLimit ?? 60,
  };
}
