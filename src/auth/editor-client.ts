export class EditorApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'EditorApiError';
  }
}

export interface EditorChange {
  last_change_date: number;
  last_change: number;
  path: string[];
  data: unknown;
  action: string;
}

export interface LoadPathsResult {
  last_change: number;
  data: Array<{
    data?: unknown;
    keys?: string[];
    path_version_hash?: string;
  }>;
}

export interface WriteChange {
  body: unknown;
  pathArray: string[];
}

export interface WriteResult {
  last_change: string;
  last_change_date: string;
  id_counter: string;
}

export interface UserPermissions {
  admin: boolean;
  permissions: {
    app: string;
    logs: string;
    data: string;
  };
  test_only: boolean;
}

export class EditorClient {
  private readonly base = 'https://bubble.io';
  private readonly sessionId: string;

  constructor(
    public readonly appId: string,
    public readonly version: string,
    private readonly cookieHeader: string,
    private readonly hashNonces: Record<string, string> = {},
  ) {
    this.sessionId = `bubble-mcp-${Date.now()}`;
  }

  async loadPaths(pathArrays: string[][]): Promise<LoadPathsResult> {
    return this.post<LoadPathsResult>(
      `/appeditor/load_multiple_paths/${this.appId}/${this.version}`,
      { path_arrays: pathArrays },
    );
  }

  async loadSinglePath(
    path: string,
  ): Promise<{ last_change: number; path_version_hash?: string; data?: unknown }> {
    return this.get(`/appeditor/load_single_path/${this.appId}/${this.version}/0/${path}`);
  }

  /**
   * Load data by path_version_hash. On branches, loadPaths returns hashes instead
   * of data — use this to resolve the hash to actual data.
   * Requires the correct nonce (captured during browser auth).
   */
  async loadByHash(
    hash: string,
  ): Promise<{ last_change: number; data?: unknown }> {
    const nonce = this.hashNonces[hash];
    if (!nonce) {
      // No nonce available — return empty (hash can't be resolved without it)
      return { last_change: 0, data: undefined };
    }
    return this.get(`/appeditor/load_single_path/${this.appId}/${this.version}/${hash}/${nonce}`);
  }

  /**
   * Load paths, automatically resolving path_version_hashes to data.
   * On branches, loadPaths may return hashes instead of inline data —
   * this method fetches the actual data for each hash.
   */
  async loadPathsResolved(pathArrays: string[][]): Promise<LoadPathsResult> {
    const result = await this.loadPaths(pathArrays);

    // Check if any entries have only a hash (no data) — resolve them
    const resolved = await Promise.all(
      result.data.map(async (entry) => {
        if (entry.data !== undefined || !entry.path_version_hash) return entry;
        // Hash-only entry — fetch actual data
        try {
          const full = await this.loadByHash(entry.path_version_hash);
          return { ...entry, data: full.data };
        } catch {
          return entry; // Keep hash-only if fetch fails
        }
      }),
    );

    return { last_change: result.last_change, data: resolved };
  }

  async getChanges(since: number = 0): Promise<EditorChange[]> {
    // Use a unique reader session ID so we see our own writes in the changes stream
    const readerId = `bubble-mcp-reader-${Date.now()}`;
    return this.get<EditorChange[]>(
      `/appeditor/changes/${this.appId}/${this.version}/${since}/${readerId}`,
    );
  }

  async write(changes: WriteChange[]): Promise<WriteResult> {
    if (changes.length === 0) {
      throw new EditorApiError(400, 'At least one change is required');
    }
    return this.post<WriteResult>('/appeditor/write', {
      v: 1,
      appname: this.appId,
      app_version: this.version,
      changes: changes.map((c) => ({
        body: c.body,
        path_array: c.pathArray,
        session_id: this.sessionId,
      })),
    });
  }

  async checkPermissions(): Promise<UserPermissions> {
    return this.post<UserPermissions>('/appeditor/get_current_user_permissions', {
      appname: this.appId,
    });
  }

  async validateSession(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/user/hi`, {
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getDerived(functionName: string): Promise<Record<string, unknown>> {
    const { hash } = await this.post<{ hash: string }>(
      '/appeditor/calculate_derived',
      {
        appname: this.appId,
        app_version: this.version,
        function_name: functionName,
      },
    );
    return this.get<Record<string, unknown>>(
      `/appeditor/derived/${this.appId}/${this.version}/${hash}`,
    );
  }

  private headers(): Record<string, string> {
    return {
      Cookie: this.cookieHeader,
      'User-Agent': 'Mozilla/5.0 (compatible; bubble-mcp/0.1.0)',
      Accept: 'application/json',
      Referer: `${this.base}/page?id=${this.appId}&tab=Design&name=index`,
      Origin: this.base,
    };
  }

  private async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new EditorApiError(
        res.status,
        `Editor API error (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    return res.json() as Promise<T>;
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new EditorApiError(
        res.status,
        `Editor API error (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    return res.json() as Promise<T>;
  }
}
