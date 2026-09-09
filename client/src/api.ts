export type ApiErrorKind =
  | "network"
  | "unauthorized"
  | "conflict"
  | "validation"
  | "rate-limit"
  | "server";

type ErrorPayload = { error?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limit";
  if (status >= 400 && status < 500) return "validation";
  return "server";
}

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  readonly retryable: boolean;

  constructor(message: string, status: number, kind: ApiErrorKind) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.retryable = kind === "network" || status >= 500 || status === 429;
  }
}

export function messageForError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "We could not reach the workspace. Check your connection and try again.",
      0,
      "network",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A proxy or server failure may return an empty/non-JSON response.
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof (payload as ErrorPayload).error === "string"
        ? (payload as ErrorPayload).error
        : "Something went wrong. Please try again.";
    throw new ApiError(message as string, response.status, kindForStatus(response.status));
  }

  return isRecord(payload) ? (payload.data as T) : (undefined as T);
}
