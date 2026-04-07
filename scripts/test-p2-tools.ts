import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';
import { createApiConnectorsTool } from '../src/tools/core/api-connectors.js';
import { createStylesTool } from '../src/tools/core/styles.js';
import { createAppSettingsTool } from '../src/tools/core/app-settings.js';
import { createReusableElementsTool } from '../src/tools/core/reusable-elements.js';
import { createAppMapTool } from '../src/tools/core/app-map.js';

const mgr = createSessionManager();
const cookie = mgr.getCookieHeader('capped-13786');
if (!cookie) {
  console.error('No session for capped-13786. Run: npm run setup capped-13786');
  process.exit(1);
}
const client = new EditorClient('capped-13786', 'test', cookie);

async function run(name: string, tool: { handler: (args: Record<string, unknown>) => Promise<any> }, args: Record<string, unknown> = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'='.repeat(60)}`);
  try {
    const result = await tool.handler(args);
    const data = JSON.parse(result.content[0].text);
    console.log(JSON.stringify(data, null, 2));
    if (result.isError) console.log('  ⚠️  isError: true');
    return data;
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return null;
  }
}

// Test all 5 new tools
await run('bubble_get_api_connectors', createApiConnectorsTool(client));
await run('bubble_get_styles', createStylesTool(client));
await run('bubble_get_app_settings (client_safe)', createAppSettingsTool(client), { section: 'client_safe' });
await run('bubble_get_app_settings (secure)', createAppSettingsTool(client), { section: 'secure' });
await run('bubble_get_reusable_elements', createReusableElementsTool(client));
await run('bubble_get_app_map', createAppMapTool(client));
await run('bubble_get_app_map (data_types only)', createAppMapTool(client), { focus: 'data_types' });

console.log('\n✅ All tools tested.');
