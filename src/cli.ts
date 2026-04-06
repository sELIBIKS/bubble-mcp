#!/usr/bin/env node

const command = process.argv[2];

if (command === 'auth') {
  const subcommand = process.argv[3] || 'login';
  if (subcommand === 'login') {
    const { browserLogin } = await import('./auth/browser-login.js');
    const appId = process.argv[4] || process.env.BUBBLE_APP_ID;
    if (!appId) {
      console.error('Usage: bubble-mcp auth login <app-id>');
      console.error('  or set BUBBLE_APP_ID environment variable');
      process.exit(1);
    }
    await browserLogin(appId);
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
