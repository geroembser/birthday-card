import type { CardData, CreateCardInput, CreateCardResponse, UpdateCardInput } from '../../shared/types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function createCard(input: CreateCardInput): Promise<CreateCardResponse> {
  return request('/api/cards', { method: 'POST', body: JSON.stringify(input) });
}

export function getCard(id: string): Promise<CardData> {
  return request(`/api/cards/${encodeURIComponent(id)}`);
}

export function updateCard(id: string, editToken: string, patch: UpdateCardInput): Promise<CardData> {
  return request(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${editToken}` },
    body: JSON.stringify(patch),
  });
}
