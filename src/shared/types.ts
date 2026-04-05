import type { BubbleRecord } from '../types.js';

export interface SearchResponse {
  response: {
    cursor: number;
    count: number;
    remaining: number;
    results: BubbleRecord[];
  };
}

export interface CountResponse {
  response?: {
    count?: number;
    remaining?: number;
  };
}
