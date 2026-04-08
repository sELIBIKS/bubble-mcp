import { createSessionManager } from '../src/auth/session-manager.js';
import { EditorClient } from '../src/auth/editor-client.js';

const mgr = createSessionManager();
const client = new EditorClient('capped-13786', 'test', mgr.getCookieHeader('capped-13786')!);

// Element keys: yMUIM (Text), QjcjB (Button), uIeMs (Icon)
const pageId = 'sbwZq';

console.log('Setting min sizes on all elements...');
await client.write([
  // Welcome Text
  { body: '200px', pathArray: ['%p3', pageId, '%el', 'yMUIM', '%p', 'min_width_css'] },
  { body: '40px', pathArray: ['%p3', pageId, '%el', 'yMUIM', '%p', 'min_height_css'] },
  { body: 200, pathArray: ['%p3', pageId, '%el', 'yMUIM', '%p', '%w'] },
  { body: 40, pathArray: ['%p3', pageId, '%el', 'yMUIM', '%p', '%h'] },

  // Sign Up Button
  { body: '200px', pathArray: ['%p3', pageId, '%el', 'QjcjB', '%p', 'min_width_css'] },
  { body: '50px', pathArray: ['%p3', pageId, '%el', 'QjcjB', '%p', 'min_height_css'] },
  { body: 200, pathArray: ['%p3', pageId, '%el', 'QjcjB', '%p', '%w'] },
  { body: 50, pathArray: ['%p3', pageId, '%el', 'QjcjB', '%p', '%h'] },

  // Star Icon
  { body: '40px', pathArray: ['%p3', pageId, '%el', 'uIeMs', '%p', 'min_width_css'] },
  { body: '40px', pathArray: ['%p3', pageId, '%el', 'uIeMs', '%p', 'min_height_css'] },
  { body: 40, pathArray: ['%p3', pageId, '%el', 'uIeMs', '%p', '%w'] },
  { body: 40, pathArray: ['%p3', pageId, '%el', 'uIeMs', '%p', '%h'] },
]);

console.log('✅ Done — refresh editor.');
console.log('   Text: 200x40, Button: 200x50, Icon: 40x40');
