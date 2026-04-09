import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { MobileDefinition } from '../../auth/mobile-definition.js';
import { successResult } from '../../middleware/error-handler.js';

const KNOWN_KEYS = new Set([
  '%d', '%x', '%nm', '%p', '%el', '%wf', '%a', '%f3', '%t', '%o',
  '%c', '%v', '%w', '%h', '%dn', '%s1', '%t1', '%9i', '%vc',
  '%p3', '%r', '%xp', '%xt',
]);

const KNOWN_ELEMENT_TYPES = new Set([
  'Page', 'Group', 'Text', 'Button', 'Input', 'Image', 'Icon',
  'RepeatingGroup', 'Popup', 'FloatingGroup', 'GroupFocus',
  'Checkbox', 'Dropdown', 'SearchBox', 'DatePicker', 'FileUploader',
  'MultilineInput', 'RadioButtons', 'SliderInput', 'MapElement',
  'VideoPlayer', 'HTML', 'Shape', 'Alert', 'CustomElement', 'AppBar',
]);

interface UnknownKey { key: string; context: string; count: number; example: { path: string }; }
interface PluginElement { type: string; count: number; pages: string[]; platform: 'web' | 'mobile'; }
interface MobileOnlyKey { key: string; context: string; meaning: string; }

function isPluginType(type: string): boolean { return /^\d{10,}x/.test(type); }

function scanObject(
  obj: unknown, path: string, unknownKeys: Map<string, UnknownKey>,
  pluginElements: Map<string, PluginElement>, pageName: string,
  platform: 'web' | 'mobile', knownCount: { value: number }, totalCount: { value: number },
): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('%')) {
      totalCount.value++;
      if (KNOWN_KEYS.has(key)) { knownCount.value++; }
      else {
        const existing = unknownKeys.get(key);
        if (existing) { existing.count++; }
        else { unknownKeys.set(key, { key, context: path, count: 1, example: { path: `${path}.${key}` } }); }
      }
    }
    if (key === '%x' && typeof value === 'string' && isPluginType(value)) {
      const existing = pluginElements.get(value);
      if (existing) { existing.count++; if (!existing.pages.includes(pageName)) existing.pages.push(pageName); }
      else { pluginElements.set(value, { type: value, count: 1, pages: [pageName], platform }); }
    }
    if (typeof value === 'object' && value !== null) {
      scanObject(value, `${path}.${key}`, unknownKeys, pluginElements, pageName, platform, knownCount, totalCount);
    }
  }
}

function collectKeys(obj: unknown, keys: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    keys.add(key);
    if (typeof value === 'object' && value !== null) collectKeys(value, keys);
  }
}

export function createDiscoverUnknownKeysTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_discover_unknown_keys',
    mode: 'read-only',
    description: 'Auto-learner: discovers unknown %-prefixed keys, plugin element/action types, and mobile-specific properties across the entire app. Reports coverage statistics.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {},
    async handler() {
      const unknownKeys = new Map<string, UnknownKey>();
      const pluginElements = new Map<string, PluginElement>();
      const knownCount = { value: 0 };
      const totalCount = { value: 0 };

      const changes = await editorClient.getChanges(0);
      for (const change of changes) {
        const pageName = change.path[1] || 'root';
        scanObject(change.data, change.path.join('.'), unknownKeys, pluginElements, pageName, 'web', knownCount, totalCount);
      }

      let mobileOnlyKeys: MobileOnlyKey[] = [];
      try {
        const mobileDef = await MobileDefinition.load(editorClient);
        if (mobileDef.hasMobilePages()) {
          const mobileKeys = new Set<string>();
          for (const [, pageData] of mobileDef.getRawPages()) {
            scanObject(pageData, 'mobile_views', unknownKeys, pluginElements, 'mobile', 'mobile', knownCount, totalCount);
            collectKeys(pageData, mobileKeys);
          }
          for (const el of mobileDef.getAllElements()) {
            scanObject(el.raw, `mobile_views.${el.pageKey}.%el`, unknownKeys, pluginElements, el.pageKey, 'mobile', knownCount, totalCount);
            collectKeys(el.raw, mobileKeys);
          }
          const knownMobileKeys: Record<string, string> = {
            '%t1': 'Page title (TextExpression)', '%9i': 'Material icon name',
            '%vc': 'Unknown (appears on buttons)', '%s1': 'Style reference name',
          };
          mobileOnlyKeys = [...mobileKeys].filter(k => k.startsWith('%')).map(k => ({
            key: k, context: 'mobile', meaning: knownMobileKeys[k] || 'Unknown',
          }));
        }
      } catch { /* Mobile scan failed */ }

      return successResult({
        unknownKeys: [...unknownKeys.values()],
        pluginElements: [...pluginElements.values()],
        pluginActions: [],
        mobileOnlyKeys,
        coverage: {
          totalPercentKeys: totalCount.value,
          knownPercentKeys: knownCount.value,
          percent: totalCount.value > 0 ? Math.round((knownCount.value / totalCount.value) * 100) : 100,
        },
      });
    },
  };
}
