#!/usr/bin/env node

function getAppId(): string | null {
  // 1. Explicit argument (skip flags starting with -)
  for (const arg of process.argv.slice(3)) {
    if (!arg.startsWith('-') && !arg.startsWith('--')) return arg;
  }

  // 2. Environment variable
  if (process.env.BUBBLE_APP_ID) return process.env.BUBBLE_APP_ID;

  // 3. Extract from BUBBLE_APP_URL (e.g. https://myapp.bubbleapps.io)
  const appUrl = process.env.BUBBLE_APP_URL;
  if (appUrl) {
    const match = appUrl.match(/https?:\/\/([^.]+)\.bubbleapps\.io/);
    if (match) return match[1];
  }

  return null;
}

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  // Also check --name=value format
  const prefixed = process.argv.find(a => a.startsWith(`--${name}=`));
  if (prefixed) return prefixed.split('=')[1];
  return undefined;
}

const command = process.argv[2];

if (command === 'auth' || command === 'setup') {
  const subcommand = command === 'setup' ? 'login' : (process.argv[3] || 'login');
  if (subcommand === 'login') {
    const { browserLogin } = await import('./auth/browser-login.js');
    const appId = getAppId();
    if (!appId) {
      console.error('Usage: bubble-mcp setup <app-id> [--branch <branch-name>] [--version <version-id>]');
      console.error('  or set BUBBLE_APP_URL / BUBBLE_APP_ID environment variable');
      process.exit(1);
    }
    const branch = getFlag('branch');
    const version = getFlag('version');
    await browserLogin(appId, (branch || version) ? { branch, version } : undefined);
  } else if (subcommand === 'status') {
    const { checkStatus } = await import('./auth/session-manager.js');
    await checkStatus();
  } else if (subcommand === 'logout') {
    const { clearSession } = await import('./auth/session-manager.js');
    clearSession();
    console.log('Session cleared.');
  } else {
    console.error(`Unknown auth subcommand: ${subcommand}`);
    console.error('Available: login, status, logout');
    process.exit(1);
  }
} else {
  console.error('Usage: bubble-mcp auth [login|status|logout]');
  process.exit(1);
}
