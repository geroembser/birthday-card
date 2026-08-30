import type {
  AppendStrokesInput,
  CardData,
  CardImage,
  CreateCardInput,
  CreateCardResponse,
  SaveResponse,
  UpdateCardInput,
} from '../../shared/types.ts';

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = res.statusText;
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
      if (typeof data.error === 'string') message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message, data);
  }
  return (await res.json()) as T;
}

const json = (body: unknown, token?: string): RequestInit => ({
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

export function createCard(input: CreateCardInput): Promise<CreateCardResponse> {
  return request('/api/cards', { method: 'POST', ...json(input) });
}

export function getCard(id: string): Promise<CardData> {
  return request(`/api/cards/${encodeURIComponent(id)}`);
}

export function updateCard(id: string, token: string, patch: UpdateCardInput): Promise<SaveResponse> {
  return request(`/api/cards/${encodeURIComponent(id)}`, { method: 'PUT', ...json(patch, token) });
}

export function appendStrokes(id: string, token: string, input: AppendStrokesInput): Promise<SaveResponse> {
  return request(`/api/cards/${encodeURIComponent(id)}/strokes`, { method: 'POST', ...json(input, token) });
}

export function uploadImage(
  id: string,
  token: string,
  blob: Blob,
  placement: Omit<CardImage, 'id'>,
): Promise<SaveResponse & { image: CardImage }> {
  const q = new URLSearchParams(Object.entries(placement).map(([k, v]) => [k, String(v)]));
  return request(`/api/cards/${encodeURIComponent(id)}/images?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type, Authorization: `Bearer ${token}` },
    body: blob,
  });
}

export function deleteImage(id: string, token: string, imageId: string): Promise<SaveResponse> {
  return request(`/api/cards/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function imageUrl(cardId: string, imageId: string): string {
  return `/api/cards/${encodeURIComponent(cardId)}/images/${encodeURIComponent(imageId)}`;
}
