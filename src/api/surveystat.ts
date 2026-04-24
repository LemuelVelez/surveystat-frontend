type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null
}

type ApiResponseEnvelope<T> = {
  data?: T
  message?: string
  error?: string
}

export type LikertValue = 1 | 2 | 3 | 4 | 5

export type LikertScaleOption = {
  value: LikertValue
  label: string
  description?: string | null
}

export type SurveyFormCode = string

export type SurveyForm = {
  id: string
  code: SurveyFormCode
  title: string
  description: string
  studyTitle?: string | null
  documentHeader?: Record<string, unknown> | null
  introduction?: string | null
  researchers?: string[] | null
  adviser?: string | null
  instruction: string
  scale: LikertScaleOption[]
  voluntaryNote?: string | null
  signatureLabel?: string | null
  isActive: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type SurveySection = {
  id: string
  formId: string
  code: string
  title: string
  sortOrder: number
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type SurveyItem = {
  id: string
  sectionId: string
  code: string
  statement: string
  sortOrder: number
  isRequired: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type SurveyQuestionnaireSection = SurveySection & {
  items: SurveyItem[]
}

export type SurveyQuestionnaireForm = SurveyForm & {
  sections: SurveyQuestionnaireSection[]
}

export type RespondentRole = "Student" | "Faculty" | "QA Personnel" | "Administrator" | string

export type CreateRespondentPayload = {
  fullName?: string | null
  email?: string | null
  role?: RespondentRole | null
  office?: string | null
  program?: string | null
  consentGiven?: boolean
}

export type SubmitSurveyAnswerPayload = {
  itemId: string
  rating: LikertValue
}

export type SubmitSurveyResponsePayload = {
  formId?: string
  formCode?: SurveyFormCode
  respondentId?: string | null
  respondent?: CreateRespondentPayload | null
  respondentSignature?: string | null
  voluntaryConsent: boolean
  answers: SubmitSurveyAnswerPayload[]
}

export type SurveyResponse = {
  id: string
  formId: string
  respondentId?: string | null
  respondentSignature?: string | null
  voluntaryConsent: boolean
  submittedAt?: string | Date | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type RatingDistribution = Record<LikertValue, number>

export type DescriptiveStatistics = {
  count: number
  mean: number
  weightedMean: number
  standardDeviation: number
  variance: number
  minimum: number
  maximum: number
  total: number
  distribution: RatingDistribution
  interpretation: string
  meanRange: string
}

export type StatisticsSummary = DescriptiveStatistics & {
  responseCount: number
  itemCount: number
  answerCount: number
}

export type SurveyItemStatistics = DescriptiveStatistics & {
  formId: string
  formCode: SurveyFormCode
  formTitle: string
  sectionId: string
  sectionCode: string
  sectionTitle: string
  itemId: string
  itemCode: string
  itemStatement: string
  itemSortOrder: number
}

export type SurveySectionStatistics = DescriptiveStatistics & {
  formId: string
  formCode: SurveyFormCode
  formTitle: string
  sectionId: string
  sectionCode: string
  sectionTitle: string
  sectionSortOrder: number
  items: SurveyItemStatistics[]
}

export type SurveyFormStatistics = DescriptiveStatistics & {
  formId: string
  formCode: SurveyFormCode
  formTitle: string
  sections: SurveySectionStatistics[]
}

export type StatisticsFilters = {
  formId?: string
  formCode?: SurveyFormCode
  sectionId?: string
  sectionCode?: string
  itemId?: string
  submittedFrom?: string
  submittedTo?: string
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

function buildQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value))
    }
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ""
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

export const surveyStatService = {
  listSurveyForms: (activeOnly = true) =>
    surveystatApi.get<SurveyForm[]>(`/surveys/forms${buildQueryString({ activeOnly })}`),

  getQuestionnaireByFormCode: (formCode: SurveyFormCode) =>
    surveystatApi.get<SurveyQuestionnaireForm>(
      `/surveys/questionnaires/code/${encodeURIComponent(formCode)}`,
    ),

  getQuestionnaireByFormId: (formId: string) =>
    surveystatApi.get<SurveyQuestionnaireForm>(`/surveys/questionnaires/${encodeURIComponent(formId)}`),

  submitSurveyResponse: (payload: SubmitSurveyResponsePayload) =>
    surveystatApi.post<SurveyResponse>("/surveys/responses", payload),

  getStatisticsSummary: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<StatisticsSummary>(`/statistics/summary${buildQueryString(filters)}`),

  getFormStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveyFormStatistics[]>(`/statistics/forms${buildQueryString(filters)}`),

  getSectionStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveySectionStatistics[]>(`/statistics/sections${buildQueryString(filters)}`),

  getItemStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveyItemStatistics[]>(`/statistics/items${buildQueryString(filters)}`),
}
