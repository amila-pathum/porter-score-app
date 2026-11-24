import { HttpErrorResponse } from '@angular/common/http';

/** A normalised API failure (RFC 7807 Problem Details, or a transport error). */
export interface ApiProblem {
  /** HTTP status, or 0 when the request never reached the server (offline, DNS, CORS). */
  status: number;
  title: string;
  detail: string;
  /** Stable machine-readable code from the API, e.g. `game.version_conflict`. */
  code: string | null;
  /** Field errors keyed by request path, e.g. `scores[2].score`. */
  fieldErrors: Record<string, string[]>;
}

export function toProblem(error: unknown): ApiProblem {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        status: 0,
        title: 'No connection',
        detail: "Couldn't reach Porter. Check your connection and try again.",
        code: 'network',
        fieldErrors: {},
      };
    }
    const body = (typeof error.error === 'object' && error.error) || {};
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries((body as { errors?: Record<string, string[]> }).errors ?? {})) {
      fieldErrors[key] = Array.isArray(value) ? value : [String(value)];
    }
    return {
      status: error.status,
      title: (body as { title?: string }).title ?? defaultTitle(error.status),
      detail: (body as { detail?: string }).detail ?? defaultDetail(error.status),
      code: (body as { code?: string }).code ?? null,
      fieldErrors,
    };
  }
  return {
    status: -1,
    title: 'Something went wrong',
    detail: 'An unexpected error occurred.',
    code: null,
    fieldErrors: {},
  };
}

/** First message for a field, also matching case-insensitively. */
export function fieldError(problem: ApiProblem | null, field: string): string | null {
  if (!problem) return null;
  const key = Object.keys(problem.fieldErrors).find((k) => k.toLowerCase() === field.toLowerCase());
  return key ? (problem.fieldErrors[key][0] ?? null) : null;
}

function defaultTitle(status: number): string {
  if (status === 404) return 'Not found';
  if (status === 409) return 'Conflict';
  if (status === 429) return 'Too many attempts';
  if (status >= 500) return 'Something went wrong';
  return 'Request failed';
}

function defaultDetail(status: number): string {
  if (status === 404) return "We can't find that. It may have been deleted, or the link is wrong.";
  if (status === 429) return 'Please wait a minute and try again.';
  if (status >= 500) return 'An unexpected error occurred on our side. Your data was not changed.';
  return 'The request could not be completed.';
}
