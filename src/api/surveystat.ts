type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null
}

type ApiResponseEnvelope<T> = {
  data?: T
  message?: string
  error?: string
}

const ENV_API_URL = (import.meta as unknown as {
  env?: Record<string, string | undefined>
}).env?.SurveyStat_URL

const DEFAULT_API_URL = "http://localhost:8080"

export const SURVEYSTAT_API_URL = normalizeBaseUrl(ENV_API_URL || DEFAULT_API_URL)

export class SurveyStatApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload: unknown = null) {
    super(message)
    this.name = "SurveyStatApiError"
    this.status = status
    this.payload = payload
  }
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "")
}

function normalizePath(path: string) {
  if (!path) return ""

  return path.startsWith("/") ? path : `/${path}`
}

function buildUrl(path: string) {
  return `${SURVEYSTAT_API_URL}${normalizePath(path)}`
}

function isJsonResponse(response: Response) {
  return response.headers.get("content-type")?.includes("application/json")
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) return null

  if (isJsonResponse(response)) {
    return response.json()
  }

  const text = await response.text()
  return text || null
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error
    }

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload
  }

  return fallback
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiResponseEnvelope<T>).data as T
  }

  return payload as T
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { headers, body, ...requestOptions } = options

  const hasJsonBody =
    body !== null &&
    body !== undefined &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)

  const response = await fetch(buildUrl(path), {
    credentials: "include",
    ...requestOptions,
    headers: {
      Accept: "application/json",
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: hasJsonBody ? JSON.stringify(body) : (body as BodyInit | null | undefined),
  })

  const payload = await parseResponseBody(response)

  if (!response.ok) {
    throw new SurveyStatApiError(
      getErrorMessage(payload, "SurveyStat request failed."),
      response.status,
      payload,
    )
  }

  return unwrapEnvelope<T>(payload)
}

export const surveystatApi = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: RequestOptions["body"], options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),

  put: <T>(path: string, body?: RequestOptions["body"], options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),

  patch: <T>(path: string, body?: RequestOptions["body"], options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),

  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),
}
