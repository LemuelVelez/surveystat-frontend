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
  surveySeriesId?: string | null
  surveyStepNumber?: number
  surveySeriesTitle?: string | null
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
  respondentInformationRequired: boolean
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
  respondentSignatureImage?: string | null
  respondentSignatureFileName?: string | null
  voluntaryConsent: boolean
  answers: SubmitSurveyAnswerPayload[]
}

export type SurveyResponse = {
  id: string
  formId: string
  respondentId?: string | null
  respondentSignature?: string | null
  respondentSignatureImage?: string | null
  respondentSignatureFileName?: string | null
  voluntaryConsent: boolean
  submittedAt?: string | Date | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type SurveyAnswer = {
  id: string
  responseId: string
  itemId: string
  rating: LikertValue
  createdAt?: string | Date
  updatedAt?: string | Date
}

export type SurveyResponseSummary = SurveyResponse & {
  formCode: SurveyFormCode
  formTitle: string
  respondentFullName?: string | null
  respondentEmail?: string | null
  respondentRole?: RespondentRole | null
  respondentOffice?: string | null
  respondentProgram?: string | null
  answerCount: number
  weightedMean: number
  interpretation: string
  meanRange: string
}

export type SurveyResponseAnswer = SurveyAnswer & {
  formId: string
  formCode: SurveyFormCode
  formTitle: string
  sectionId: string
  sectionCode: string
  sectionTitle: string
  itemCode: string
  itemStatement: string
  itemSortOrder: number
  interpretation: string
  meanRange: string
}

export type RatingDistribution = Record<LikertValue, number>

export type DescriptiveCalculationStep = {
  label: string
  formula: string
  substitution: string
  result: string
}

export type DescriptiveCalculation = {
  basis: string
  scale: string
  weightedTotal: number
  squaredDeviationsTotal: number
  steps: DescriptiveCalculationStep[]
}

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
  calculation?: DescriptiveCalculation
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

export type CreateSurveyItemPayload = {
  code?: string
  statement: string
  sortOrder?: number
  isRequired?: boolean
}

export type CreateSurveySectionPayload = {
  code?: string
  title: string
  sortOrder?: number
  items: CreateSurveyItemPayload[]
}

export type CreateSurveyFormPayload = {
  code: SurveyFormCode
  surveySeriesId?: string | null
  surveyStepNumber?: number
  surveySeriesTitle?: string | null
  title: string
  description?: string
  studyTitle?: string | null
  documentHeader?: Record<string, unknown> | null
  introduction?: string | null
  researchers?: string[] | null
  adviser?: string | null
  instruction?: string
  scale?: LikertScaleOption[]
  voluntaryNote?: string | null
  signatureLabel?: string | null
  respondentInformationRequired?: boolean
  isActive?: boolean
  sections?: CreateSurveySectionPayload[]
}

export type CreateSurveySeriesPayload = {
  surveySeriesId?: string | null
  surveySeriesTitle: string
  forms: CreateSurveyFormPayload[]
}

export type UpdateSurveyFormRespondentInformationPayload = {
  respondentInformationRequired: boolean
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

export type SurveyResponseFilters = {
  formId?: string
  formCode?: SurveyFormCode
  respondentId?: string
  submittedOnly?: boolean
  limit?: number
  offset?: number
}

const ENV = (import.meta as unknown as {
  env?: Record<string, string | undefined>
}).env

const PROCESS_ENV = (globalThis as unknown as {
  process?: {
    env?: Record<string, string | undefined>
  }
}).process?.env

const ENV_API_URL = ENV?.SurveyStat_URL || PROCESS_ENV?.SurveyStat_URL
const ENV_SYSTEM_URL = ENV?.VITE_ACREDIFY_SYSTEM_URL || ENV?.VITE_SYSTEM_URL

export const SURVEYSTAT_API_URL = resolveRequiredUrl(ENV_API_URL, "SurveyStat_URL")
export const ACREDIFY_SYSTEM_URL = normalizeOptionalUrl(ENV_SYSTEM_URL)

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
  return url.trim().replace(/\/+$/, "")
}

function normalizeOptionalUrl(url?: string) {
  const trimmed = url?.trim()

  if (!trimmed) {
    return ""
  }

  return normalizeBaseUrl(trimmed)
}

function resolveRequiredUrl(url: string | undefined, envName: string) {
  const normalizedUrl = normalizeOptionalUrl(url)

  if (!normalizedUrl) {
    throw new SurveyStatApiError(
      `${envName} is not configured.`,
      500,
      { envName },
    )
  }

  return normalizedUrl
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

function hasTextValue(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0
}

function getTextRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return ""
}

const validRespondentRoles = new Set<RespondentRole>([
  "Student",
  "Faculty",
  "QA Personnel",
  "Administrator",
])

function normalizeRespondentRole(role?: RespondentRole | null): RespondentRole | null {
  const normalizedRole = typeof role === "string" ? role.trim() : ""

  if (!normalizedRole) {
    return null
  }

  return validRespondentRoles.has(normalizedRole) ? normalizedRole : null
}

function normalizeRespondentPayload(respondent?: CreateRespondentPayload | null): CreateRespondentPayload | null {
  if (!respondent) {
    return null
  }

  return {
    ...respondent,
    role: normalizeRespondentRole(respondent.role),
  }
}

function hasRespondentDetails(respondent?: CreateRespondentPayload | null) {
  if (!respondent) return false

  return (
    hasTextValue(respondent.fullName) ||
    hasTextValue(respondent.email) ||
    hasTextValue(respondent.role) ||
    hasTextValue(respondent.office) ||
    hasTextValue(respondent.program)
  )
}

function withAnonymousRespondent(payload: SubmitSurveyResponsePayload): SubmitSurveyResponsePayload {
  if (payload.respondentId) {
    return payload
  }

  const respondent = normalizeRespondentPayload(payload.respondent)

  if (hasRespondentDetails(respondent)) {
    return {
      ...payload,
      respondent,
    }
  }

  return {
    ...payload,
    respondent: {
      fullName: "Anonymous Respondent",
      consentGiven: payload.voluntaryConsent,
    },
  }
}

function normalizeSurveyResponseSummary(response: SurveyResponseSummary, index: number): SurveyResponseSummary {
  const record = response as SurveyResponseSummary & Record<string, unknown>
  const anonymousLabel = `Anonymous Respondent ${index + 1}`
  const respondentFullName = hasTextValue(response.respondentFullName)
    ? response.respondentFullName!.trim()
    : anonymousLabel
  const respondentId = hasTextValue(response.respondentId)
    ? response.respondentId!.trim()
    : `anonymous-${response.id || index + 1}`
  const respondentSignature = getTextRecordValue(record, [
    "respondentSignature",
    "respondent_signature",
    "respondentSignatureUrl",
    "respondent_signature_url",
    "signature",
    "signatureUrl",
    "signature_url",
  ])
  const respondentSignatureImage = getTextRecordValue(record, [
    "respondentSignatureImage",
    "respondent_signature_image",
    "respondentSignatureDataUrl",
    "respondent_signature_data_url",
    "signatureImage",
    "signature_image",
    "signatureDataUrl",
    "signature_data_url",
    "signatureBase64",
    "signature_base64",
  ])
  const respondentSignatureFileName = getTextRecordValue(record, [
    "respondentSignatureFileName",
    "respondent_signature_file_name",
    "signatureFileName",
    "signature_file_name",
    "fileName",
    "file_name",
  ])

  return {
    ...response,
    respondentId,
    respondentFullName,
    respondentRole: hasTextValue(response.respondentRole) ? String(response.respondentRole).trim() : "Anonymous",
    respondentSignature: respondentSignature || response.respondentSignature || null,
    respondentSignatureImage: respondentSignatureImage || response.respondentSignatureImage || null,
    respondentSignatureFileName: respondentSignatureFileName || response.respondentSignatureFileName || null,
  }
}

function normalizeSurveyResponseSummaryList(responses: SurveyResponseSummary[]) {
  return responses.map(normalizeSurveyResponseSummary)
}

export const surveyStatService = {
  listSurveyForms: (activeOnly = true) =>
    surveystatApi.get<SurveyForm[]>(`/surveys/forms${buildQueryString({ activeOnly })}`),

  createSurveyForm: (payload: CreateSurveyFormPayload) =>
    surveystatApi.post<SurveyQuestionnaireForm>("/surveys/forms", payload),

  createSurveySeries: (payload: CreateSurveySeriesPayload) =>
    surveystatApi.post<SurveyQuestionnaireForm[]>("/surveys/series", payload),

  updateSurveyFormRespondentInformation: (formId: string, payload: UpdateSurveyFormRespondentInformationPayload) =>
    surveystatApi.patch<SurveyForm>(`/surveys/forms/${encodeURIComponent(formId)}/respondent-information`, payload),

  getQuestionnaireByFormCode: (formCode: SurveyFormCode) =>
    surveystatApi.get<SurveyQuestionnaireForm>(
      `/surveys/questionnaires/code/${encodeURIComponent(formCode)}`,
    ),

  getQuestionnaireByFormId: (formId: string) =>
    surveystatApi.get<SurveyQuestionnaireForm>(`/surveys/questionnaires/${encodeURIComponent(formId)}`),

  submitSurveyResponse: (payload: SubmitSurveyResponsePayload) =>
    surveystatApi.post<SurveyResponse>("/surveys/responses", withAnonymousRespondent(payload)),

  listSurveyResponses: (filters: SurveyResponseFilters = {}) =>
    surveystatApi
      .get<SurveyResponseSummary[]>(`/surveys/responses${buildQueryString(filters)}`)
      .then(normalizeSurveyResponseSummaryList),

  getResponseAnswers: (responseId: string) =>
    surveystatApi.get<SurveyResponseAnswer[]>(
      `/surveys/responses/${encodeURIComponent(responseId)}/answers`,
    ),

  resendResponseReviewEmail: (responseId: string) =>
    surveystatApi.post<{ response: SurveyResponseSummary; answers: SurveyResponseAnswer[] }>(
      `/surveys/responses/${encodeURIComponent(responseId)}/resend-review`,
    ),

  deleteSurveyResponse: (responseId: string) =>
    surveystatApi.del<SurveyResponse>(`/surveys/responses/${encodeURIComponent(responseId)}`),

  getStatisticsSummary: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<StatisticsSummary>(`/statistics/summary${buildQueryString(filters)}`),

  getFormStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveyFormStatistics[]>(`/statistics/forms${buildQueryString(filters)}`),

  getSectionStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveySectionStatistics[]>(`/statistics/sections${buildQueryString(filters)}`),

  getItemStatistics: (filters: StatisticsFilters = {}) =>
    surveystatApi.get<SurveyItemStatistics[]>(`/statistics/items${buildQueryString(filters)}`),
}
