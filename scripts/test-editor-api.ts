/**
 * Proof-of-concept: Test if we can access Bubble's internal editor APIs
 * using an authenticated session (collaborator access).
 *
 * Usage:
 *   npx tsx scripts/test-editor-api.ts
 *
 * Set these env vars before running:
 *   BUBBLE_APP_ID=capped-13786
 *   BUBBLE_SESSION_COOKIE="your_cookie_string_here"
 */

const APP_ID = process.env.BUBBLE_APP_ID || 'capped-13786';
const SESSION_COOKIE = process.env.BUBBLE_SESSION_COOKIE || '';

if (!SESSION_COOKIE) {
  console.error('❌ Set BUBBLE_SESSION_COOKIE env var first.');
  console.error('   Get it from Chrome DevTools → Application → Cookies → bubble.io');
  console.error('   Copy all cookie name=value pairs, semicolon-separated.');
  process.exit(1);
}

const EDITOR_BASE = 'https://bubble.io';

interface TestResult {
  endpoint: string;
  status: number;
  contentType: string | null;
  dataPreview: string;
  success: boolean;
  dataKeys?: string[];
}

async function testEndpoint(
  name: string,
  url: string,
  options: RequestInit = {},
): Promise<TestResult> {
  console.log(`\n🔍 Testing: ${name}`);
  console.log(`   URL: ${url}`);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Cookie: SESSION_COOKIE,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: `${EDITOR_BASE}/page?id=${APP_ID}&tab=Design&name=index`,
        Origin: EDITOR_BASE,
        ...((options.headers as Record<string, string>) || {}),
      },
      redirect: 'follow',
    });

    const contentType = res.headers.get('content-type');
    const text = await res.text();
    let dataKeys: string[] | undefined;

    // Try to parse as JSON to see the structure
    try {
      const json = JSON.parse(text);
      if (typeof json === 'object' && json !== null) {
        dataKeys = Object.keys(json).slice(0, 30);
      }
    } catch {
      // Not JSON
    }

    const preview = text.slice(0, 500);
    const success = res.status === 200 && !text.includes('<!DOCTYPE');

    console.log(`   Status: ${res.status}`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Success: ${success ? '✅' : '❌'}`);
    if (dataKeys) {
      console.log(`   Top-level keys: ${dataKeys.join(', ')}`);
    }
    console.log(`   Preview: ${preview.slice(0, 200)}...`);

    return { endpoint: name, status: res.status, contentType, dataPreview: preview, success, dataKeys };
  } catch (err: any) {
    console.log(`   Error: ${err.message}`);
    return {
      endpoint: name,
      status: 0,
      contentType: null,
      dataPreview: err.message,
      success: false,
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Bubble Editor API Proof-of-Concept');
  console.log(`App ID: ${APP_ID}`);
  console.log('='.repeat(60));

  const results: TestResult[] = [];

  // 1. Test the init/data endpoint (discovered in editor JS)
  results.push(
    await testEndpoint(
      'Init Data (editor bootstrap)',
      `${EDITOR_BASE}/api/1.1/init/data?location=${encodeURIComponent(`/page?id=${APP_ID}&tab=Design&name=index`)}`,
    ),
  );

  // 2. Test fetching the app definition directly
  results.push(
    await testEndpoint(
      'App JSON export',
      `${EDITOR_BASE}/app/${APP_ID}/export_app_json`,
    ),
  );

  // 3. Test app metadata endpoint
  results.push(
    await testEndpoint(
      'App metadata',
      `${EDITOR_BASE}/api/app/${APP_ID}`,
    ),
  );

  // 4. Test a direct app settings/definition endpoint
  results.push(
    await testEndpoint(
      'App definition (editor route)',
      `${EDITOR_BASE}/editor/${APP_ID}/app_definition`,
    ),
  );

  // 5. Test the public meta endpoint (baseline - should work without session)
  results.push(
    await testEndpoint(
      'Public Meta API (baseline)',
      `https://${APP_ID}.bubbleapps.io/api/1.1/meta`,
    ),
  );

  // 6. Test Swagger (baseline)
  results.push(
    await testEndpoint(
      'Public Swagger (baseline)',
      `https://${APP_ID}.bubbleapps.io/api/1.1/meta/swagger.json`,
    ),
  );

  // 7. Try fetching page list
  results.push(
    await testEndpoint(
      'Page list',
      `${EDITOR_BASE}/api/1.1/obj/${APP_ID}/page`,
    ),
  );

  // 8. Try the app_json endpoint pattern from the worker.js
  results.push(
    await testEndpoint(
      'App JSON (internal pattern)',
      `${EDITOR_BASE}/app_json/${APP_ID}`,
    ),
  );

  // 9. Try a POST-based app data fetch
  results.push(
    await testEndpoint(
      'POST app data fetch',
      `${EDITOR_BASE}/api/1.1/init/data`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: APP_ID,
          location: `/page?id=${APP_ID}&tab=Design&name=index`,
        }),
      },
    ),
  );

  // 10. Try getting workflow definitions
  results.push(
    await testEndpoint(
      'Workflow objects',
      `${EDITOR_BASE}/api/1.1/obj/${APP_ID}/workflow_object`,
    ),
  );

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} ${r.endpoint} — ${r.status} ${r.contentType || 'N/A'}`);
    if (r.dataKeys && r.dataKeys.length > 0) {
      console.log(`   Keys: ${r.dataKeys.join(', ')}`);
    }
  }

  const successes = results.filter((r) => r.success);
  console.log(`\n${successes.length}/${results.length} endpoints returned usable data.`);

  if (successes.length > 0) {
    console.log('\n🎉 Some endpoints work! The collaborator session approach is viable.');
    console.log('Next step: examine the successful responses to map the data structure.');
  } else {
    console.log('\n⚠️  No endpoints returned usable data.');
    console.log('Possible issues:');
    console.log('  - Session cookie expired or incomplete');
    console.log('  - Need different endpoint patterns');
    console.log('  - Editor uses WebSocket instead of REST for app data');
  }
}

main().catch(console.error);
