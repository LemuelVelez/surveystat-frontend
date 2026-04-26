import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry, type ColDef, type RowClickedEvent } from "ag-grid-community"
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  Eye,
  FileDown,
  Loader2,
  Mail,
  RefreshCcw,
  Share2,
  Trash2,
  Table2,
  UsersRound,
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import "ag-grid-community/styles/ag-grid.css"
import "ag-grid-community/styles/ag-theme-quartz.css"

import {
  SURVEYSTAT_API_URL,
  SurveyStatApiError,
  surveyStatService,
  type SurveyForm,
  type SurveyResponseAnswer,
  type SurveyResponseSummary,
} from "@/api/surveystat"
import Preview, { type PreviewColumn, type PreviewSummaryItem } from "@/components/preview"

ModuleRegistry.registerModules([AllCommunityModule])

function getErrorMessage(error: unknown) {
  if (error instanceof SurveyStatApiError || error instanceof Error) {
    return error.message
  }

  return "Unable to load survey responses. Please try again."
}

function formatDate(value?: string | Date | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return date.toLocaleString()
}

function formatNumber(value?: number | null, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—"
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function getSurveyShareUrl(formCodes: string[]) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const codes = formCodes.map((code) => code.trim()).filter(Boolean)

  if (codes.length === 0) {
    return `${origin}/survey`
  }

  return `${origin}/survey?forms=${encodeURIComponent(codes.join(","))}`
}

async function copyText(value: string, successMessage: string) {
  await navigator.clipboard.writeText(value)
  toast.success(successMessage)
}

function getAnonymousRespondentName(index: number) {
  return `Anonymous Respondent ${index + 1}`
}

function getRespondentDisplayName(response: SurveyResponseSummary, index: number) {
  const respondentName = response.respondentFullName?.trim()

  if (respondentName && respondentName.toLowerCase() !== "anonymous respondent") {
    return respondentName
  }

  return getAnonymousRespondentName(index)
}

function getRespondentKey(response: SurveyResponseSummary) {
  return response.respondentId?.trim() || `anonymous-${response.id}`
}

const DEFAULT_SIGNATURE_S3_BUCKET = "surveystat"
const DEFAULT_SIGNATURE_S3_REGION = "ap-southeast-1"

function getRawSignatureValues(response: SurveyResponseSummary) {
  return [
    response.respondentSignatureImage,
    response.respondentSignature,
    response.respondentSignatureFileName,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
}

function decodeSignatureEntities(value: string) {
  return value
    .trim()
    .replace(/^[']+|[']+$/g, "")
    .replace(/^["]+|["]+$/g, "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
}

function normalizeDataSignatureImage(value: string) {
  const decodedValue = decodeSignatureEntities(value)
  const compactValue = decodedValue.replace(/\s+/g, "")

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(compactValue)) {
    return compactValue
  }

  if (/^data:image\/[a-z0-9.+-]+,/i.test(decodedValue)) {
    return decodedValue
  }

  const base64Value = compactValue.replace(/^base64,/i, "")
  const hasImageMagicNumber = /^(iVBORw0KGgo|\/9j\/|UklGR|R0lGOD)/.test(base64Value)
  const isBase64Like = base64Value.length > 80 && /^[A-Za-z0-9+/=]+$/.test(base64Value)

  if (!hasImageMagicNumber || !isBase64Like) {
    return ""
  }

  if (base64Value.startsWith("/9j/")) {
    return "data:image/jpeg;base64," + base64Value
  }

  if (base64Value.startsWith("UklGR")) {
    return "data:image/webp;base64," + base64Value
  }

  if (base64Value.startsWith("R0lGOD")) {
    return "data:image/gif;base64," + base64Value
  }

  return "data:image/png;base64," + base64Value
}

function uniqueSignatureValues(values: string[]) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index)
}

function encodeSignatureUrl(value: string) {
  return encodeURI(value).replace(/%25([0-9A-F]{2})/gi, "%$1")
}

function getUrlPathWithSearch(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`
}

function buildS3ObjectUrl(bucketName: string, region: string, key: string, endpointStyle: "dash" | "dot" = "dash") {
  const cleanKey = key.replace(/^\/+/, "")
  const host = endpointStyle === "dash" ? `${bucketName}.s3-${region}.amazonaws.com` : `${bucketName}.s3.${region}.amazonaws.com`

  return encodeSignatureUrl(`https://${host}/${cleanKey}`)
}

function getS3UrlCandidates(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const pathWithSearch = getUrlPathWithSearch(url)
    const virtualHostedMatch = url.hostname.match(/^([^.]+)\.s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i)
    const globalHostedMatch = url.hostname.match(/^([^.]+)\.s3\.amazonaws\.com$/i)
    const pathStyleMatch = url.hostname.match(/^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/i)
    const candidates: string[] = []

    if (virtualHostedMatch) {
      const [, bucketName, region] = virtualHostedMatch
      candidates.push(`${url.protocol}//${bucketName}.s3-${region}.amazonaws.com${pathWithSearch}`)
      candidates.push(`${url.protocol}//${bucketName}.s3.${region}.amazonaws.com${pathWithSearch}`)
    }

    if (globalHostedMatch) {
      const [, bucketName] = globalHostedMatch
      candidates.push(`${url.protocol}//${bucketName}.s3-${DEFAULT_SIGNATURE_S3_REGION}.amazonaws.com${pathWithSearch}`)
      candidates.push(`${url.protocol}//${bucketName}.s3.${DEFAULT_SIGNATURE_S3_REGION}.amazonaws.com${pathWithSearch}`)
    }

    if (pathStyleMatch) {
      const [, region] = pathStyleMatch
      const pathParts = url.pathname.split("/").filter(Boolean)
      const [bucketName, ...keyParts] = pathParts

      if (bucketName && keyParts.length > 0) {
        const key = keyParts.join("/")
        candidates.push(buildS3ObjectUrl(bucketName, region, key, "dash"))
        candidates.push(buildS3ObjectUrl(bucketName, region, key, "dot"))
      }
    }

    candidates.push(rawUrl)

    return uniqueSignatureValues(candidates.map(encodeSignatureUrl))
  } catch {
    return []
  }
}

function getRelativeS3SignatureCandidates(value: string) {
  const key = value.replace(/^\/+/, "")

  if (!/^(uploads|upload|files|file|storage|signatures|signature)\//i.test(key)) {
    return []
  }

  return [
    buildS3ObjectUrl(DEFAULT_SIGNATURE_S3_BUCKET, DEFAULT_SIGNATURE_S3_REGION, key, "dash"),
    buildS3ObjectUrl(DEFAULT_SIGNATURE_S3_BUCKET, DEFAULT_SIGNATURE_S3_REGION, key, "dot"),
  ]
}

function normalizeSignatureUrls(value: string) {
  const decodedValue = decodeSignatureEntities(value)
  const candidates: string[] = []

  if (/^blob:/i.test(decodedValue)) {
    return [decodedValue]
  }

  if (/^https?:\/\//i.test(decodedValue)) {
    return getS3UrlCandidates(decodedValue)
  }

  if (decodedValue.startsWith("//")) {
    const protocol = typeof window !== "undefined" ? window.location.protocol : "https:"
    return getS3UrlCandidates(protocol + decodedValue)
  }

  if (decodedValue.startsWith("/")) {
    const relativePath = decodedValue.replace(/^\/+/, "")
    candidates.push(...getRelativeS3SignatureCandidates(relativePath))
    candidates.push(SURVEYSTAT_API_URL + encodeSignatureUrl(decodedValue))
  }

  if (/^(uploads|upload|files|file|storage|signatures|signature)\//i.test(decodedValue)) {
    candidates.push(...getRelativeS3SignatureCandidates(decodedValue))
    candidates.push(SURVEYSTAT_API_URL + "/" + encodeSignatureUrl(decodedValue))
  }

  return uniqueSignatureValues(candidates)
}

function normalizeSignatureImageSources(value: string) {
  const dataImage = normalizeDataSignatureImage(value)

  if (dataImage) {
    return [dataImage]
  }

  return normalizeSignatureUrls(value)
}

function getResponseSignatureImageSources(response: SurveyResponseSummary) {
  return uniqueSignatureValues(getRawSignatureValues(response).flatMap(normalizeSignatureImageSources))
}

function getResponseSignatureFallbackValue(response: SurveyResponseSummary) {
  return getRawSignatureValues(response).find((value) => normalizeSignatureImageSources(value).length === 0) ?? ""
}

function getResponseSignatureUrl(response: SurveyResponseSummary) {
  return getResponseSignatureImageSources(response).find((source) => /^https?:\/\//i.test(source)) ?? ""
}

function getSignatureExportValue(response: SurveyResponseSummary) {
  const signatureUrl = getResponseSignatureUrl(response)

  if (signatureUrl) {
    return signatureUrl
  }

  return getResponseSignatureFallbackValue(response) || "—"
}

type SignatureImageProps = {
  sources: string[]
  fallback?: string
  className?: string
}

function SignatureImage({ sources, fallback = "", className = "" }: SignatureImageProps) {
  const [sourceIndex, setSourceIndex] = useState(0)
  const source = sources[sourceIndex]

  useEffect(() => {
    setSourceIndex(0)
  }, [sources.join("|")])

  if (source) {
    return (
      <img
        src={source}
        alt="Respondent signature"
        referrerPolicy="no-referrer"
        className={className}
        onError={() => setSourceIndex((currentIndex) => currentIndex + 1)}
      />
    )
  }

  if (fallback) {
    return <span className="text-sm font-bold text-slate-700 wrap-anywhere">{fallback}</span>
  }

  return <span className="text-sm font-semibold text-slate-400">—</span>
}

function renderSignatureValue(response: SurveyResponseSummary) {
  return (
    <SignatureImage
      sources={getResponseSignatureImageSources(response)}
      fallback={getResponseSignatureFallbackValue(response)}
      className="max-h-16 rounded-lg border border-slate-200 bg-white p-2"
    />
  )
}

function renderSignatureSummaryValue(response: SurveyResponseSummary) {
  const sources = getResponseSignatureImageSources(response)
  const fallback = getResponseSignatureFallbackValue(response)

  if (sources.length > 0 || fallback) {
    return (
      <div className="flex min-h-24 min-w-0 items-center">
        <SignatureImage
          sources={sources}
          fallback={fallback}
          className="max-h-24 max-w-full rounded-lg border border-slate-200 bg-white p-2"
        />
      </div>
    )
  }

  return "—"
}

type SelectionCheckboxProps = {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}

function SelectionCheckbox({ checked, indeterminate = false, disabled = false, label, onChange }: SelectionCheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <label
      className="flex h-full w-full cursor-pointer items-center justify-center"
      title={label}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="sr-only">{label}</span>
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer rounded border border-slate-300 bg-white accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}

function GridViewport({ children }: { children: ReactNode }) {
  return (
    <div className="surveystat-grid-shell min-w-0 overflow-hidden rounded-2xl border border-slate-100">
      <style>{`
        .surveystat-grid-shell .ag-root-wrapper,
        .surveystat-grid-shell .ag-root,
        .surveystat-grid-shell .ag-body,
        .surveystat-grid-shell .ag-body-viewport {
          min-width: 0;
        }

        .surveystat-grid-shell .ag-paging-panel {
          box-sizing: border-box;
          height: auto;
          min-height: 64px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.25rem 0.5rem;
          padding: 0.5rem;
          font-size: 0.75rem;
          line-height: 1.25rem;
        }

        .surveystat-grid-shell .ag-paging-row-summary-panel,
        .surveystat-grid-shell .ag-paging-page-summary-panel {
          display: flex;
          min-width: 0;
          flex: 0 1 auto;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          margin: 0;
          white-space: nowrap;
        }

        .surveystat-grid-shell .ag-paging-description,
        .surveystat-grid-shell .ag-paging-number,
        .surveystat-grid-shell .ag-paging-row-summary-panel span {
          flex-shrink: 0;
          white-space: nowrap;
        }

        .surveystat-grid-shell .ag-paging-page-size {
          display: none;
        }

        @media (max-width: 420px) {
          .surveystat-grid-shell .ag-paging-panel {
            min-height: 86px;
            gap: 0.125rem 0.25rem;
            padding: 0.5rem 0.25rem;
            font-size: 0.6875rem;
          }

          .surveystat-grid-shell .ag-paging-page-summary-panel {
            order: 1;
            flex-basis: 100%;
          }

          .surveystat-grid-shell .ag-paging-row-summary-panel {
            order: 2;
            flex-basis: 100%;
          }

          .surveystat-grid-shell .ag-paging-button {
            width: 1.75rem;
            min-width: 1.75rem;
            height: 1.75rem;
            margin: 0;
          }
        }
      `}</style>
      {children}
    </div>
  )
}

export function Respondents() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [responses, setResponses] = useState<SurveyResponseSummary[]>([])
  const [answers, setAnswers] = useState<SurveyResponseAnswer[]>([])
  const [selectedResponseId, setSelectedResponseId] = useState("")
  const [selectedResponseIds, setSelectedResponseIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAnswersLoading, setIsAnswersLoading] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isResponsesPreviewOpen, setIsResponsesPreviewOpen] = useState(false)
  const [pendingDeleteResponses, setPendingDeleteResponses] = useState<SurveyResponseSummary[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const selectedForm = useMemo(
    () => forms.find((form) => form.code === selectedFormCode) ?? null,
    [forms, selectedFormCode],
  )
  const selectedResponse = useMemo(
    () => responses.find((response) => response.id === selectedResponseId) ?? null,
    [responses, selectedResponseId],
  )
  const selectedResponseIdsSet = useMemo(() => new Set(selectedResponseIds), [selectedResponseIds])
  const selectedResponses = useMemo(
    () => responses.filter((response) => selectedResponseIdsSet.has(response.id)),
    [responses, selectedResponseIdsSet],
  )
  const isAllResponsesSelected = responses.length > 0 && responses.every((response) => selectedResponseIdsSet.has(response.id))
  const isSomeResponsesSelected = responses.some((response) => selectedResponseIdsSet.has(response.id))
  const selectedShareUrl = useMemo(
    () => getSurveyShareUrl(selectedFormCode ? [selectedFormCode] : forms.map((form) => form.code)),
    [forms, selectedFormCode],
  )
  const responseCount = responses.length
  const answerCount = responses.reduce((total, response) => total + (response.answerCount ?? 0), 0)
  const respondentCount = new Set(responses.map(getRespondentKey)).size
  const averageWeightedMean =
    responses.length > 0
      ? responses.reduce((total, response) => total + (response.weightedMean ?? 0), 0) / responses.length
      : 0
  const responsesForPreview = selectedResponses.length > 0 ? selectedResponses : responses
  const responsesPreviewCount = responsesForPreview.length
  const responsesPreviewAnswerCount = responsesForPreview.reduce((total, response) => total + (response.answerCount ?? 0), 0)
  const responsesPreviewRespondentCount = new Set(responsesForPreview.map(getRespondentKey)).size
  const responsesPreviewAverageWeightedMean =
    responsesForPreview.length > 0
      ? responsesForPreview.reduce((total, response) => total + (response.weightedMean ?? 0), 0) / responsesForPreview.length
      : 0
  const responsesPreviewSelectionLabel =
    selectedResponses.length > 0 ? `Selected responses (${selectedResponses.length})` : "All visible responses"
  const selectedResponseIndex = selectedResponse
    ? Math.max(
        0,
        responses.findIndex((response) => response.id === selectedResponse.id),
      )
    : 0
  const selectedRespondentName = selectedResponse ? getRespondentDisplayName(selectedResponse, selectedResponseIndex) : ""
  const selectedSignatureSources = selectedResponse ? getResponseSignatureImageSources(selectedResponse) : []
  const selectedSignatureFallback = selectedResponse ? getResponseSignatureFallbackValue(selectedResponse) : ""
  const pendingDeleteCount = pendingDeleteResponses.length
  const deleteButtonLabel = selectedResponses.length > 0 ? `Delete Selected (${selectedResponses.length})` : "Delete All"

  const toggleResponseSelection = useCallback((responseId: string, isSelected: boolean) => {
    setSelectedResponseIds((current) => {
      if (isSelected) {
        return current.includes(responseId) ? current : [...current, responseId]
      }

      return current.filter((selectedResponseId) => selectedResponseId !== responseId)
    })
  }, [])

  const toggleAllResponsesSelection = useCallback(
    (isSelected: boolean) => {
      setSelectedResponseIds(isSelected ? responses.map((response) => response.id) : [])
    },
    [responses],
  )

  const responseColumnDefs = useMemo<ColDef<SurveyResponseSummary>[]>(
    () => [
      {
        colId: "responseSelection",
        headerName: "",
        width: 56,
        minWidth: 56,
        maxWidth: 56,
        pinned: "left",
        sortable: false,
        filter: false,
        resizable: false,
        suppressNavigable: true,
        cellClass: "!flex !items-center !justify-center bg-white",
        headerClass: "!flex !items-center !justify-center bg-white",
        headerComponent: () => (
          <SelectionCheckbox
            checked={isAllResponsesSelected}
            indeterminate={isSomeResponsesSelected && !isAllResponsesSelected}
            disabled={responses.length === 0}
            label="Select all responses"
            onChange={toggleAllResponsesSelection}
          />
        ),
        cellRenderer: (params: { data?: SurveyResponseSummary; node?: { rowIndex?: number | null } }) => {
          const response = params.data
          const responseId = response?.id ?? ""
          const respondentName = response ? getRespondentDisplayName(response, params.node?.rowIndex ?? 0) : "response"

          return (
            <SelectionCheckbox
              checked={Boolean(responseId && selectedResponseIdsSet.has(responseId))}
              disabled={!responseId}
              label={`Select ${respondentName}`}
              onChange={(isSelected) => {
                if (responseId) {
                  toggleResponseSelection(responseId, isSelected)
                }
              }}
            />
          )
        },
      },
      { field: "formTitle", headerName: "Survey", minWidth: 240, flex: 1 },
      {
        field: "respondentFullName",
        headerName: "Respondent",
        minWidth: 200,
        flex: 1,
        valueGetter: (params) => (params.data ? getRespondentDisplayName(params.data, params.node?.rowIndex ?? 0) : "Anonymous"),
      },
      { field: "respondentEmail", headerName: "Email", minWidth: 200, flex: 1 },
      { field: "respondentRole", headerName: "Role", width: 150 },
      {
        field: "respondentSignature",
        headerName: "Signature",
        minWidth: 170,
        flex: 1,
        valueGetter: (params) => (params.data ? getSignatureExportValue(params.data) : "—"),
      },
      { field: "answerCount", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 170, flex: 1 },
      {
        field: "submittedAt",
        headerName: "Submitted",
        minWidth: 210,
        flex: 1,
        valueFormatter: (params) => formatDate(params.value),
      },
    ],
    [isAllResponsesSelected, isSomeResponsesSelected, responses.length, selectedResponseIdsSet, toggleAllResponsesSelection, toggleResponseSelection],
  )

  const answerColumnDefs = useMemo<ColDef<SurveyResponseAnswer>[]>(
    () => [
      { field: "sectionTitle", headerName: "Section", minWidth: 200, flex: 1 },
      { field: "itemCode", headerName: "Code", width: 130 },
      { field: "itemStatement", headerName: "Checklist Item", minWidth: 320, flex: 2 },
      { field: "rating", headerName: "Rating", width: 120 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 170, flex: 1 },
    ],
    [],
  )

  const responsesPreviewColumns = useMemo<PreviewColumn<SurveyResponseSummary>[]>(
    () => [
      { key: "formTitle", header: "Survey" },
      { key: "formCode", header: "Code" },
      { key: "respondentFullName", header: "Respondent", getValue: (row, index) => getRespondentDisplayName(row, index) },
      { key: "respondentEmail", header: "Email", getValue: (row) => row.respondentEmail || "—" },
      { key: "respondentRole", header: "Role", getValue: (row) => row.respondentRole || "—" },
      { key: "respondentOffice", header: "Office", getValue: (row) => row.respondentOffice || "—" },
      { key: "respondentProgram", header: "Program", getValue: (row) => row.respondentProgram || "—" },
      {
        key: "respondentSignature",
        header: "Signature URL",
        getValue: (row) => getSignatureExportValue(row),
        renderValue: (row) => renderSignatureValue(row),
      },
      { key: "answerCount", header: "Answers" },
      { key: "weightedMean", header: "Weighted Mean", getValue: (row) => formatNumber(row.weightedMean) },
      { key: "interpretation", header: "Interpretation", getValue: (row) => row.interpretation || "No data" },
      { key: "meanRange", header: "Mean Range", getValue: (row) => row.meanRange || "—" },
      { key: "submittedAt", header: "Submitted", getValue: (row) => formatDate(row.submittedAt) },
    ],
    [],
  )

  const responsesPreviewSummary = useMemo<PreviewSummaryItem[]>(
    () => [
      { label: "Filter", value: selectedForm?.title ?? "All survey responses" },
      { label: "Selection", value: responsesPreviewSelectionLabel },
      { label: "Responses", value: responsesPreviewCount },
      { label: "Respondents", value: responsesPreviewRespondentCount },
      { label: "Answers", value: responsesPreviewAnswerCount },
      { label: "Average Weighted Mean", value: formatNumber(responsesPreviewAverageWeightedMean) },
    ],
    [
      responsesPreviewAnswerCount,
      responsesPreviewAverageWeightedMean,
      responsesPreviewCount,
      responsesPreviewRespondentCount,
      responsesPreviewSelectionLabel,
      selectedForm,
    ],
  )

  const responsePreviewColumns = useMemo<PreviewColumn<SurveyResponseAnswer>[]>(
    () => [
      { key: "sectionTitle", header: "Section" },
      { key: "itemCode", header: "Code" },
      { key: "itemStatement", header: "Checklist Item" },
      { key: "rating", header: "Rating" },
      { key: "interpretation", header: "Interpretation" },
      { key: "meanRange", header: "Mean Range" },
    ],
    [],
  )

  const responsePreviewSummary = useMemo<PreviewSummaryItem[]>(
    () =>
      selectedResponse
        ? [
            { label: "Survey", value: selectedResponse.formTitle },
            { label: "Respondent", value: selectedRespondentName },
            { label: "Email", value: selectedResponse.respondentEmail || "—" },
            { label: "Role", value: selectedResponse.respondentRole || "—" },
            {
              label: "Signature URL",
              value: renderSignatureSummaryValue(selectedResponse),
              exportValue: getSignatureExportValue(selectedResponse),
            },
            { label: "Answers", value: selectedResponse.answerCount },
            { label: "Weighted Mean", value: formatNumber(selectedResponse.weightedMean) },
            { label: "Interpretation", value: selectedResponse.interpretation || "No data" },
            { label: "Submitted", value: formatDate(selectedResponse.submittedAt) },
          ]
        : [],
    [selectedRespondentName, selectedResponse],
  )

  async function loadRespondentsPage(formCode = selectedFormCode) {
    setIsLoading(true)
    setErrorMessage("")

    try {
      const [surveyForms, surveyResponses] = await Promise.all([
        surveyStatService.listSurveyForms(true),
        surveyStatService.listSurveyResponses({
          formCode: formCode || undefined,
          submittedOnly: true,
          limit: 500,
        }),
      ])

      setForms(surveyForms)
      setResponses(surveyResponses)
      setSelectedResponseId((current) => (surveyResponses.some((response) => response.id === current) ? current : ""))
      setSelectedResponseIds((current) => current.filter((responseId) => surveyResponses.some((response) => response.id === responseId)))
      setAnswers([])
    } catch (error) {
      const message = getErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  async function loadResponseAnswers(responseId: string): Promise<SurveyResponseAnswer[]> {
    setSelectedResponseId(responseId)
    setAnswers([])

    if (!responseId) {
      return []
    }

    setIsAnswersLoading(true)

    try {
      const responseAnswers = (await surveyStatService.getResponseAnswers(responseId)) ?? []
      setAnswers(responseAnswers)
      return responseAnswers
    } catch (error) {
      toast.error(getErrorMessage(error))
      return []
    } finally {
      setIsAnswersLoading(false)
    }
  }

  async function ensureSelectedAnswers(): Promise<SurveyResponseAnswer[]> {
    if (!selectedResponse) {
      toast.error("Please select one response first.")
      return []
    }

    if (answers.length > 0 && selectedResponseId === selectedResponse.id) {
      return answers
    }

    return loadResponseAnswers(selectedResponse.id)
  }

  async function openResponsePreview() {
    const loadedAnswers = await ensureSelectedAnswers()

    if (loadedAnswers.length > 0 || selectedResponse) {
      setIsPreviewOpen(true)
    }
  }

  async function resendResponseReviewEmail() {
    if (!selectedResponse) {
      toast.error("Please select one response first.")
      return
    }

    setIsResending(true)

    try {
      await surveyStatService.resendResponseReviewEmail(selectedResponse.id)
      toast.success("Response review email resent successfully.")
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsResending(false)
    }
  }

  function openDeleteResponsesDialog() {
    const responsesToDelete = selectedResponses.length > 0 ? selectedResponses : responses

    if (responsesToDelete.length === 0) {
      toast.error("No survey responses to delete.")
      return
    }

    setPendingDeleteResponses(responsesToDelete)
  }

  async function confirmDeleteResponses() {
    if (pendingDeleteResponses.length === 0) return

    const responsesToDelete = pendingDeleteResponses
    const deletedResponseIds = new Set(responsesToDelete.map((response) => response.id))

    setIsDeleting(true)

    try {
      for (const response of responsesToDelete) {
        await surveyStatService.deleteSurveyResponse(response.id)
      }

      toast.success(
        responsesToDelete.length === 1
          ? "Survey response deleted successfully."
          : `${responsesToDelete.length} survey responses deleted successfully.`,
      )
      setPendingDeleteResponses([])
      setSelectedResponseId((current) => (deletedResponseIds.has(current) ? "" : current))
      setSelectedResponseIds((current) => current.filter((responseId) => !deletedResponseIds.has(responseId)))

      if (selectedResponseId && deletedResponseIds.has(selectedResponseId)) {
        setAnswers([])
      }

      await loadRespondentsPage(selectedFormCode)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  function handleSurveySelect(formCode: string) {
    setSelectedFormCode(formCode)
    loadRespondentsPage(formCode)
  }

  function handleRowClicked(event: RowClickedEvent<SurveyResponseSummary>) {
    if (event.data?.id) {
      loadResponseAnswers(event.data.id)
    }
  }

  useEffect(() => {
    loadRespondentsPage("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
        <header className="mb-6 rounded-2xl bg-slate-950 p-4 text-white shadow-xl sm:mb-8 sm:rounded-3xl sm:p-6">
          <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100">
                <ArrowLeft className="size-4 shrink-0" />
                <span className="truncate">Back to Home</span>
              </Link>
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950 sm:size-12">
                  <UsersRound className="size-5 sm:size-6" />
                </span>
                <div className="min-w-0">
                  <h1 className="wrap-break-word text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">Respondents</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 wrap-anywhere">
                    Collect, filter, and review submitted responses from every survey form in one page.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 lg:flex lg:flex-col xl:flex-row">
              <button
                type="button"
                onClick={() => copyText(selectedShareUrl, "Survey share link copied.")}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-5"
              >
                <Copy className="size-4 shrink-0" />
                <span className="truncate">Copy Share Link</span>
              </button>
              <button
                type="button"
                onClick={() => loadRespondentsPage(selectedFormCode)}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 sm:px-5"
              >
                <RefreshCcw className="size-4 shrink-0" />
                <span className="truncate">Refresh</span>
              </button>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700 wrap-anywhere sm:px-5">
            {errorMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="wrap-break-word text-lg font-black sm:text-xl">Survey Response Filter</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 wrap-anywhere">
                Choose which survey responses to view, or select all surveys for the complete collection.
              </p>
            </div>
            <span className="max-w-full rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600 wrap-anywhere sm:max-w-sm">
              {selectedForm?.title ?? "All survey responses"}
            </span>
          </div>

          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SurveyFilterButton
              title="All Surveys"
              subtitle="View responses from every survey form"
              isActive={!selectedFormCode}
              icon={<ClipboardList className="size-5" />}
              onClick={() => handleSurveySelect("")}
            />

            {forms.map((form) => (
              <SurveyFilterButton
                key={form.id}
                title={form.title}
                subtitle={form.code}
                isActive={selectedFormCode === form.code}
                icon={<Share2 className="size-5" />}
                onClick={() => handleSurveySelect(form.code)}
              />
            ))}
          </div>
        </section>

        <section className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Responses" value={responseCount} />
          <SummaryCard label="Respondents" value={respondentCount} />
          <SummaryCard label="Answers" value={answerCount} />
          <SummaryCard label="Average Weighted Mean" value={formatNumber(averageWeightedMean)} />
        </section>

        {isLoading ? (
          <div className="flex min-h-96 items-center justify-center rounded-2xl bg-white shadow-sm sm:rounded-3xl">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <div className="min-w-0 space-y-6">
            <GridCard
              title="Survey Responses"
              rows={responses.length}
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => setIsResponsesPreviewOpen(true)}
                    disabled={responses.length === 0}
                    className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  >
                    <FileDown className="size-4 shrink-0" />
                    <span className="truncate">{selectedResponses.length > 0 ? `Preview Selected (${selectedResponses.length})` : "Preview Export"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={openDeleteResponsesDialog}
                    disabled={responses.length === 0 || isDeleting}
                    className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 shrink-0" />}
                    <span className="truncate">{deleteButtonLabel}</span>
                  </button>
                </>
              }
            >
              <GridViewport>
                <div className="ag-theme-quartz h-96 w-full min-w-0">
                  <AgGridReact
                    rowData={responses}
                    columnDefs={responseColumnDefs}
                    defaultColDef={{ sortable: true, filter: true, resizable: true }}
                    pagination
                    paginationPageSize={10}
                    paginationPageSizeSelector={false}
                    animateRows
                    getRowId={(params) => params.data?.id ?? ""}
                    onRowClicked={handleRowClicked}
                  />
                </div>
              </GridViewport>
            </GridCard>

            <GridCard title={selectedResponse ? `Response Result · ${selectedResponse.formTitle}` : "Response Result"} rows={answers.length}>
              {selectedResponse ? (
                <div className="mb-4 space-y-4">
                  <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950 wrap-anywhere">{selectedRespondentName}</p>
                      <p className="mt-1 text-sm text-slate-500 wrap-anywhere">{selectedResponse.respondentEmail || "No respondent email"}</p>
                    </div>
                    <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 lg:flex lg:flex-wrap">
                      <button
                        type="button"
                        onClick={openResponsePreview}
                        className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-500 sm:w-auto"
                      >
                        <Eye className="size-4 shrink-0" />
                        <span className="truncate">Preview Export</span>
                      </button>
                      <button
                        type="button"
                        disabled={isResending || !selectedResponse.respondentEmail}
                        onClick={resendResponseReviewEmail}
                        className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        {isResending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4 shrink-0" />}
                        <span className="truncate">Resend Review</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Respondent" value={selectedRespondentName} />
                    <SummaryCard label="Weighted Mean" value={formatNumber(selectedResponse.weightedMean)} />
                    <SummaryCard label="Interpretation" value={selectedResponse.interpretation || "No data"} />
                    <SummaryCard label="Submitted" value={formatDate(selectedResponse.submittedAt)} />
                  </div>

                  {selectedSignatureSources.length > 0 || selectedSignatureFallback ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Respondent Signature</p>
                      <div className="mt-3 rounded-xl border border-cyan-200 bg-white p-3">
                        <SignatureImage
                          sources={selectedSignatureSources}
                          fallback={selectedSignatureFallback}
                          className="max-h-32 max-w-full"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mb-4 rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                  Select one response row above to view its answers and result.
                </div>
              )}

              {isAnswersLoading ? (
                <div className="flex min-h-60 items-center justify-center rounded-2xl bg-slate-50">
                  <Loader2 className="size-8 animate-spin text-cyan-600" />
                </div>
              ) : (
                <GridViewport>
                  <div className="ag-theme-quartz h-96 w-full min-w-0">
                    <AgGridReact
                      rowData={answers}
                      columnDefs={answerColumnDefs}
                      defaultColDef={{ sortable: true, filter: true, resizable: true }}
                      pagination
                      paginationPageSize={10}
                      paginationPageSizeSelector={false}
                      animateRows
                    />
                  </div>
                </GridViewport>
              )}
            </GridCard>
          </div>
        )}
      </div>

      <Preview
        isOpen={isResponsesPreviewOpen}
        title={
          selectedResponses.length > 0
            ? `Selected Responses Preview Export · ${selectedResponses.length} selected`
            : selectedForm
              ? `Responses Preview Export · ${selectedForm.title}`
              : "Responses Preview Export"
        }
        subtitle={
          selectedResponses.length > 0
            ? selectedFormCode
              ? `Selected responses filtered by ${selectedFormCode}`
              : "Selected submitted survey responses"
            : selectedFormCode
              ? `Filtered by ${selectedFormCode}`
              : "All submitted survey responses"
        }
        fileName={
          selectedResponses.length > 0
            ? selectedFormCode
              ? `${selectedFormCode}-selected-survey-responses`
              : "selected-survey-responses"
            : selectedFormCode
              ? `${selectedFormCode}-survey-responses`
              : "all-survey-responses"
        }
        summary={responsesPreviewSummary}
        rows={responsesForPreview}
        columns={responsesPreviewColumns}
        isLoading={isLoading}
        onClose={() => setIsResponsesPreviewOpen(false)}
      />

      <Preview
        isOpen={isPreviewOpen}
        title={selectedResponse ? `Response Preview · ${selectedResponse.formTitle}` : "Response Preview"}
        subtitle={selectedResponse ? `${selectedRespondentName} · ${formatDate(selectedResponse.submittedAt)}` : undefined}
        fileName={selectedResponse ? `${selectedResponse.formCode}-${selectedRespondentName || "response"}` : "survey-response"}
        summary={responsePreviewSummary}
        rows={answers}
        columns={responsePreviewColumns}
        isLoading={isAnswersLoading}
        onClose={() => setIsPreviewOpen(false)}
      />

      {pendingDeleteCount > 0 ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4">
          <div className="max-h-[calc(100svh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl shadow-slate-950/30 sm:rounded-3xl sm:p-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                <Trash2 className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 className="wrap-break-word text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  {pendingDeleteCount === responses.length ? "Delete all survey responses?" : `Delete ${pendingDeleteCount} survey response${pendingDeleteCount === 1 ? "" : "s"}?`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This will remove {pendingDeleteCount === responses.length ? "all visible responses" : "the selected responses"} and their answers from SurveyStat.
                </p>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                  {pendingDeleteCount === 1 ? (
                    <>
                      <p className="font-black text-slate-950 wrap-anywhere">
                        {getRespondentDisplayName(
                          pendingDeleteResponses[0],
                          Math.max(
                            0,
                            responses.findIndex((response) => response.id === pendingDeleteResponses[0].id),
                          ),
                        )}
                      </p>
                      <p className="mt-1 text-slate-500 wrap-anywhere">{pendingDeleteResponses[0].formTitle}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-black text-slate-950">{pendingDeleteCount} responses will be deleted.</p>
                      <p className="mt-1 text-slate-500">
                        {pendingDeleteCount === responses.length ? "Delete all visible rows." : "Delete selected rows only."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteResponses([])}
                disabled={isDeleting}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteResponses}
                disabled={isDeleting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300 sm:w-auto"
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

type SurveyFilterButtonProps = {
  title: string
  subtitle: string
  isActive: boolean
  icon: ReactNode
  onClick: () => void
}

function SurveyFilterButton({ title, subtitle, isActive, icon, onClick }: SurveyFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-2xl border p-4 text-left transition ${
        isActive ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block font-black text-slate-950 wrap-anywhere">{title}</span>
          <span className="mt-1 line-clamp-2 block text-sm font-semibold text-slate-500 wrap-anywhere">{subtitle}</span>
        </span>
      </div>
    </button>
  )
}

type SummaryCardProps = {
  label: string
  value: string | number
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-3 text-xl font-black tracking-tight text-slate-950 wrap-break-word sm:text-2xl">{value}</p>
    </div>
  )
}

type GridCardProps = {
  title: string
  rows: number
  actions?: ReactNode
  children: ReactNode
}

function GridCard({ title, rows, actions, children }: GridCardProps) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
            <Table2 className="size-5" />
          </span>
          <h2 className="min-w-0 wrap-break-word text-lg font-black sm:text-xl">{title}</h2>
        </div>
        <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:grid-flow-col sm:auto-cols-max sm:items-center">
          {actions}
          <span className="inline-flex w-full justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600 sm:w-auto">{rows} rows</span>
        </div>
      </div>
      {children}
    </section>
  )
}

export default Respondents