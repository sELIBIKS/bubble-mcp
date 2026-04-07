import type { EditorChange } from './editor-client.js';

export interface DeepFieldDef {
  key: string;
  name: string;
  fieldType: string;
  isList: boolean;
  raw: unknown;
}

export interface DataTypeDef {
  key: string;
  name: string;
  privacyRoles: Record<string, unknown>;
  fields: Record<string, unknown>;
  deepFields?: DeepFieldDef[];
}

export interface PagePathInfo {
  name: string;
  id: string;
  path: string | null;
}

export interface OptionSetDef {
  key: string;
  name: string;
  options: unknown[];
  raw: unknown;
}

export interface ApiConnectorDef {
  key: string;
  name: string;
  calls: Record<string, unknown>;
  raw: unknown;
}

export interface StyleDef {
  key: string;
  name: string;
  elementType: string;
  properties: Record<string, unknown>;
  raw: unknown;
}

export interface AppSummary {
  dataTypeCount: number;
  optionSetCount: number;
  pageCount: number;
  apiConnectorCount: number;
  reusableElementCount: number;
  dataTypeNames: string[];
  optionSetNames: string[];
  pageNames: string[];
}

export class AppDefinition {
  private userTypes = new Map<string, unknown>();
  private optionSets = new Map<string, unknown>();
  private pages = new Map<string, string>();
  private pagePaths = new Map<string, string>();
  private deepFieldStore = new Map<string, Map<string, unknown>>();
  private settingsMap = new Map<string, unknown>();
  private apiConnectors = new Map<string, Map<string, unknown>>();
  private stylesMap = new Map<string, unknown>();
  private reusableElementIndex = new Map<string, string>();

  static fromChanges(changes: EditorChange[]): AppDefinition {
    const def = new AppDefinition();

    for (const change of changes) {
      const [root, sub, marker, fieldKey] = change.path;

      if (root === 'user_types' && sub && change.path.length === 2) {
        def.userTypes.set(sub, change.data);
      }

      // Deep field: user_types/<typeKey>/%f3/<fieldKey>
      if (root === 'user_types' && sub && marker === '%f3' && fieldKey && change.path.length === 4) {
        if (!def.deepFieldStore.has(sub)) {
          def.deepFieldStore.set(sub, new Map());
        }
        def.deepFieldStore.get(sub)!.set(fieldKey, change.data);
      }

      if (root === 'option_sets' && sub && change.path.length === 2) {
        def.optionSets.set(sub, change.data);
      }

      if (root === '_index' && sub === 'page_name_to_id' && change.path.length === 2) {
        const pageMap = change.data as Record<string, string>;
        for (const [name, id] of Object.entries(pageMap)) {
          def.pages.set(name, id);
        }
      }

      if (root === '_index' && sub === 'page_name_to_path' && change.path.length === 2) {
        const pathMap = change.data as Record<string, string>;
        for (const [name, path] of Object.entries(pathMap)) {
          def.pagePaths.set(name, path);
        }
      }

      // Settings: depth 2 = full section, depth 3+ = nested key within section
      if (root === 'settings' && sub) {
        if (change.path.length === 2) {
          def.settingsMap.set(sub, change.data);
        } else {
          // Build nested settings from granular changes
          // e.g. ['settings', 'client_safe', 'plugins', 'id'] -> settingsMap['client_safe'].plugins.id = data
          if (!def.settingsMap.has(sub)) {
            def.settingsMap.set(sub, {});
          }
          const section = def.settingsMap.get(sub) as Record<string, unknown>;
          const keys = change.path.slice(2);
          let target: Record<string, unknown> = section;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!target[keys[i]] || typeof target[keys[i]] !== 'object') {
              target[keys[i]] = {};
            }
            target = target[keys[i]] as Record<string, unknown>;
          }
          target[keys[keys.length - 1]] = change.data;
          def.settingsMap.set(sub, section);
        }
      }

      // API connectors: api/<connectorKey> at depth 2, or api/<key>/<subkey> at depth 3+
      if (root === 'api' && sub) {
        if (change.path.length === 2) {
          // Full connector object
          const connMap = new Map<string, unknown>();
          const obj = change.data as Record<string, unknown>;
          for (const [k, v] of Object.entries(obj)) {
            connMap.set(k, v);
          }
          def.apiConnectors.set(sub, connMap);
        } else if (change.path.length >= 3) {
          // Incremental sub-path update
          if (!def.apiConnectors.has(sub)) {
            def.apiConnectors.set(sub, new Map());
          }
          const connMap = def.apiConnectors.get(sub)!;
          const subKey = change.path.slice(2).join('.');
          connMap.set(subKey, change.data);
        }
      }

      // Styles
      if (root === 'styles' && sub && change.path.length === 2) {
        def.stylesMap.set(sub, change.data);
      }

      // Reusable element index
      if (root === '_index' && sub === 'custom_name_to_id' && change.path.length === 2) {
        const map = change.data as Record<string, string>;
        for (const [name, id] of Object.entries(map)) {
          def.reusableElementIndex.set(name, id);
        }
      }
    }

    return def;
  }

  getDataTypes(): DataTypeDef[] {
    const result: DataTypeDef[] = [];
    for (const [key, raw] of this.userTypes) {
      if (raw === null || raw === undefined) continue;
      const obj = raw as Record<string, unknown>;
      const deepFieldMap = this.deepFieldStore.get(key);
      const deepFields: DeepFieldDef[] | undefined = deepFieldMap
        ? [...deepFieldMap.entries()]
            .filter(([, fRaw]) => fRaw !== null && fRaw !== undefined)
            .map(([fKey, fRaw]) => {
              const fObj = fRaw as Record<string, unknown>;
              return {
                key: fKey,
                name: (fObj['%d'] as string) || fKey,
                fieldType: (fObj['%t'] as string) || 'unknown',
                isList: (fObj['%o'] as boolean) || false,
                raw: fRaw,
              };
            })
        : undefined;

      result.push({
        key,
        name: (obj['%d'] as string) || key,
        privacyRoles: (obj['privacy_role'] as Record<string, unknown>) || {},
        fields: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'privacy_role'),
        ),
        deepFields,
      });
    }
    return result;
  }

  getOptionSets(): OptionSetDef[] {
    const result: OptionSetDef[] = [];
    for (const [key, raw] of this.optionSets) {
      if (raw === null || raw === undefined) continue;
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        options: (obj['options'] as unknown[]) || [],
        raw,
      });
    }
    return result;
  }

  getPageNames(): string[] {
    return [...this.pages.keys()];
  }

  getPagePaths(): PagePathInfo[] {
    const result: PagePathInfo[] = [];
    for (const [name, id] of this.pages) {
      result.push({
        name,
        id,
        path: this.pagePaths.get(name) ?? null,
      });
    }
    return result;
  }

  resolvePagePath(pageName: string): string | null {
    return this.pagePaths.get(pageName) ?? null;
  }

  resolvePageId(pageName: string): string | null {
    return this.pages.get(pageName) ?? null;
  }

  /**
   * Merge page index data loaded directly via EditorClient.loadPaths().
   * Call this after fromChanges() when the changes stream doesn't contain page_name_to_id.
   */
  mergePageIndexes(
    pageNameToId: Record<string, string> | null,
    pageNameToPath: Record<string, string> | null,
  ): void {
    if (pageNameToId) {
      for (const [name, id] of Object.entries(pageNameToId)) {
        if (!this.pages.has(name)) this.pages.set(name, id);
      }
    }
    if (pageNameToPath) {
      for (const [name, path] of Object.entries(pageNameToPath)) {
        if (!this.pagePaths.has(name)) this.pagePaths.set(name, path);
      }
    }
  }

  getSettings(): Record<string, unknown> {
    return Object.fromEntries(this.settingsMap);
  }

  getApiConnectors(): ApiConnectorDef[] {
    const result: ApiConnectorDef[] = [];
    for (const [key, connMap] of this.apiConnectors) {
      const raw = Object.fromEntries(connMap);
      // Name comes from %p.wf_name (incremental) or %p.wf_name inside %p object
      const props = raw['%p'] as Record<string, unknown> | undefined;
      const incrName = raw['%p.wf_name'] as string | undefined;
      const name = incrName || props?.wf_name as string || (raw['%d'] as string) || key;
      const calls: Record<string, unknown> = {};
      for (const [k, v] of connMap) {
        if (k === 'actions' && typeof v === 'object' && v !== null) {
          Object.assign(calls, v as Record<string, unknown>);
        }
      }
      result.push({ key, name, calls, raw });
    }
    return result;
  }

  getStyles(): StyleDef[] {
    const result: StyleDef[] = [];
    for (const [key, raw] of this.stylesMap) {
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || (obj['name'] as string) || key,
        elementType: (obj['%type'] as string) || (obj['element_type'] as string) || 'unknown',
        properties: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'name' && k !== 'element_type'),
        ),
        raw,
      });
    }
    return result;
  }

  getReusableElementNames(): string[] {
    return [...this.reusableElementIndex.keys()];
  }

  getReusableElementIndex(): Map<string, string> {
    return new Map(this.reusableElementIndex);
  }

  /**
   * Merge reusable element index loaded directly via EditorClient.loadPaths().
   */
  mergeReusableElementIndex(nameToId: Record<string, string> | null): void {
    if (nameToId) {
      for (const [name, id] of Object.entries(nameToId)) {
        if (!this.reusableElementIndex.has(name)) {
          this.reusableElementIndex.set(name, id);
        }
      }
    }
  }

  getSummary(): AppSummary {
    const types = this.getDataTypes();
    const sets = this.getOptionSets();
    const pages = this.getPageNames();
    return {
      dataTypeCount: types.length,
      optionSetCount: sets.length,
      pageCount: pages.length,
      apiConnectorCount: this.apiConnectors.size,
      reusableElementCount: this.reusableElementIndex.size,
      dataTypeNames: types.map((t) => t.name),
      optionSetNames: sets.map((s) => s.name),
      pageNames: pages,
    };
  }
}
