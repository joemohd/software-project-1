// Thin fetch wrapper for the NestJS API. Every request sends the httpOnly auth cookies (ACC-19).

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');

/** Status used when the server could not be reached at all. */
export const NETWORK_ERROR_STATUS = 0;

/** An error response from the API, normalised from NestJS's `{ statusCode, message, error }` body. */
export class ApiError extends Error {
  readonly status: number;
  /** Every message the server sent (validation errors arrive as a list). */
  readonly messages: string[];
  /** The raw JSON body, for fields such as `mustChangePassword`. */
  readonly body: Record<string, unknown>;

  constructor(status: number, messages: string[], body: Record<string, unknown> = {}) {
    super(messages[0] ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.body = body;
  }
}

/** Reads `message` from a NestJS error body, which may be a string or a list of strings. */
export const errorMessages = (body: Record<string, unknown>, fallback: string): string[] => {
  const { message } = body;
  if (Array.isArray(message)) {
    const list = message.filter((item): item is string => typeof item === 'string');
    if (list.length > 0) return list;
  }
  if (typeof message === 'string' && message.trim()) return [message];
  return [fallback];
};

const parseJson = async (response: Response): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** Sends a JSON request to `${API_URL}${path}` and returns the parsed body, or throws ApiError. */
export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, ["Can't reach the server. Check your connection and try again."]);
  }

  const body = await parseJson(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorMessages(body, `Request failed (${response.status}).`), body);
  }
  return body as T;
};
