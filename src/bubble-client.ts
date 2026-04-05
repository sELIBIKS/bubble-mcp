import type { BubbleConfig } from './types.js';

export class BubbleApiError extends Error {
  constructor(public code: number, message: string, public bubbleStatus?: string) {
    super(message);
    this.name = 'BubbleApiError';
  }
}

export class BubbleClient {
  public readonly baseUrl: string;
  private readonly token: string;

  constructor(config: BubbleConfig) {
    const envPrefix = config.environment === 'development' ? '/version-test' : '';
    this.baseUrl = `${config.appUrl}${envPrefix}/api/1.1`;
    this.token = config.apiToken;
  }

  async get<T = unknown>(path: string): Promise<T> { return this.request<T>('GET', path); }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body: unknown): Promise<void> {
    await this.request('PATCH', path, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body: unknown): Promise<void> {
    await this.request('PUT', path, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async delete(path: string): Promise<void> { await this.request('DELETE', path); }

  async postBulk(path: string, records: unknown[]): Promise<string> {
    const body = records.map(r => JSON.stringify(r)).join('\n');
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'text/plain' },
      body,
    });
    if (!response.ok) await this.handleError(response);
    return response.text();
  }

  private async request<T>(method: string, path: string, options?: { headers?: Record<string, string>; body?: string }): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${this.token}`, ...options?.headers },
      body: options?.body,
    });
    if (!response.ok) await this.handleError(response);
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  private async handleError(response: Response): Promise<never> {
    let message = `Bubble API error (${response.status})`;
    let bubbleStatus: string | undefined;
    try {
      const body = await response.json() as { body?: { status?: string; message?: string } };
      if (body?.body?.message) message = body.body.message;
      bubbleStatus = body?.body?.status;
    } catch { /* not JSON */ }
    throw new BubbleApiError(response.status, message, bubbleStatus);
  }
}
