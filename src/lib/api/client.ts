/**
 * Standard typed HTTP client for browser requests.
 * Uses credentials: 'include' so HTTP-only auth cookies are automatically sent.
 */

export interface ApiErrorResponse {
  code?: string;
  message?: string;
  details?: unknown;
  error?: {
    message?: string;
    code?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    let message: string | undefined;
    let code: string | undefined;
    let details: unknown;

    if (data && typeof data === "object") {
      const payload = data as Record<string, unknown>;
      if (typeof payload.message === "string" && payload.message.trim()) {
        message = payload.message;
      } else if (payload.error && typeof payload.error === "object") {
        const nested = payload.error as Record<string, unknown>;
        if (typeof nested.message === "string" && nested.message.trim()) {
          message = nested.message;
        }
        if (typeof nested.code === "string") {
          code = nested.code;
        }
        details = nested.details;
      } else if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }

      if (!code && typeof payload.code === "string") {
        code = payload.code;
      }
      if (details === undefined && payload.details !== undefined) {
        details = payload.details;
      }
    } else if (typeof data === "string" && data.trim()) {
      message = data;
    }

    if (!message) {
      message = `Request failed with status ${response.status}`;
    }

    throw new ApiError(message, response.status, code, details);
  }

  return data as T;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
};
