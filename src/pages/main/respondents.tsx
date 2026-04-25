import { useEffect, useMemo, useState, type ReactNode } from "react"
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

function getResponseSignatureValue(response: SurveyResponseSummary) {
  return response.respondentSignatureImage?.trim() || response.respondentSignature?.trim() || ""
}

function isDataSignatureImage(value: string) {
  return /^data:image\//i.test(value.trim())
}

function isImageSignatureValue(value: string) {
  return isDataSignatureImage(value) || /^https?:\/\//i.test(value.trim())
}

function getSignatureExportValue(response: SurveyResponseSummary) {
  const signature = getResponseSignatureValue(response)

  if (!signature) {
    return "—"
  }

  if (isDataSignatureImage(signature)) {
    return "Signature image attached"
  }

  return signature
}

function renderSignatureValue(response: SurveyResponseSummary) {
  const signature = getResponseSignatureValue(response)

  if (!signature) {
    return <span className="text-sm font-semibold text-slate-400">—</span>
  }

  if (isImageSignatureValue(signature)) {
    return (
      <img
        src={signature}
        alt="Respondent signature"
        className="max-h-16 rounded-lg border border-slate-200 bg-white p-2"
      />
    )
  }

  return <span className="text-sm font-bold text-slate-700">{signature}</span>
}

export function Respondents() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [responses, setResponses] = useState<SurveyResponseSummary[]>([])
  const [answers, setAnswers] = useState<SurveyResponseAnswer[]>([])
  const [selectedResponseId, setSelectedResponseId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isAnswersLoading, setIsAnswersLoading] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isResponsesPreviewOpen, setIsResponsesPreviewOpen] = useState(false)
  const [pendingDeleteResponse, setPendingDeleteResponse] = useState<SurveyResponseSummary | null>(null)
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
  const selectedResponseIndex = selectedResponse
    ? Math.max(
        0,
        responses.findIndex((response) => response.id === selectedResponse.id),
      )
    : 0
  const selectedRespondentName = selectedResponse ? getRespondentDisplayName(selectedResponse, selectedResponseIndex) : ""
  const selectedSignatureValue = selectedResponse ? getResponseSignatureValue(selectedResponse) : ""

  const responseColumnDefs = useMemo<ColDef<SurveyResponseSummary>[]>(
    () => [
      { field: "formTitle", headerName: "Survey", minWidth: 260, flex: 1 },
      {
        field: "respondentFullName",
        headerName: "Respondent",
        minWidth: 220,
        flex: 1,
        valueGetter: (params) => (params.data ? getRespondentDisplayName(params.data, params.node?.rowIndex ?? 0) : "Anonymous"),
      },
      { field: "respondentEmail", headerName: "Email", minWidth: 220, flex: 1 },
      { field: "respondentRole", headerName: "Role", width: 160 },
      {
        field: "respondentSignature",
        headerName: "Signature",
        minWidth: 180,
        flex: 1,
        valueGetter: (params) => (params.data ? getSignatureExportValue(params.data) : "—"),
      },
      { field: "answerCount", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 170, flex: 1 },
      {
        field: "submittedAt",
        headerName: "Submitted",
        minWidth: 220,
        flex: 1,
        valueFormatter: (params) => formatDate(params.value),
      },
    ],
    [],
  )

  const answerColumnDefs = useMemo<ColDef<SurveyResponseAnswer>[]>(
    () => [
      { field: "sectionTitle", headerName: "Section", minWidth: 220, flex: 1 },
      { field: "itemCode", headerName: "Code", width: 140 },
      { field: "itemStatement", headerName: "Checklist Item", minWidth: 420, flex: 2 },
      { field: "rating", headerName: "Rating", width: 120 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 180, flex: 1 },
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
        header: "Signature",
        getValue: (row) => getSignatureExportValue(row),
        getImageValue: (row) => {
          const signature = getResponseSignatureValue(row)
          return isDataSignatureImage(signature) ? signature : ""
        },
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
      { label: "Responses", value: responseCount },
      { label: "Respondents", value: respondentCount },
      { label: "Answers", value: answerCount },
      { label: "Average Weighted Mean", value: formatNumber(averageWeightedMean) },
    ],
    [answerCount, averageWeightedMean, respondentCount, responseCount, selectedForm],
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
            { label: "Signature", value: getSignatureExportValue(selectedResponse) },
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

  async function confirmDeleteResponse() {
    if (!pendingDeleteResponse) return

    setIsDeleting(true)

    try {
      await surveyStatService.deleteSurveyResponse(pendingDeleteResponse.id)
      toast.success("Survey response deleted successfully.")
      setPendingDeleteResponse(null)
      setSelectedResponseId("")
      setAnswers([])
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
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-8 rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-cyan-100">
                <ArrowLeft className="size-4" />
                Back to Home
              </Link>
              <div className="flex items-start gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950">
                  <UsersRound className="size-6" />
                </span>
                <div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">Respondents</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Collect, filter, and review submitted responses from every survey form in one page.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => copyText(selectedShareUrl, "Survey share link copied.")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
              >
                <Copy className="size-4" />
                Copy Share Link
              </button>
              <button
                type="button"
                onClick={() => loadRespondentsPage(selectedFormCode)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <RefreshCcw className="size-4" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Survey Response Filter</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Choose which survey responses to view, or select all surveys for the complete collection.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
              {selectedForm?.title ?? "All survey responses"}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Responses" value={responseCount} />
          <SummaryCard label="Respondents" value={respondentCount} />
          <SummaryCard label="Answers" value={answerCount} />
          <SummaryCard label="Average Weighted Mean" value={formatNumber(averageWeightedMean)} />
        </section>

        {isLoading ? (
          <div className="flex min-h-96 items-center justify-center rounded-3xl bg-white shadow-sm">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <GridCard
              title="Survey Responses"
              rows={responses.length}
              actions={
                <button
                  type="button"
                  onClick={() => setIsResponsesPreviewOpen(true)}
                  disabled={responses.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FileDown className="size-4" />
                  Preview Export
                </button>
              }
            >
              <div className="ag-theme-quartz h-96 w-full">
                <AgGridReact
                  rowData={responses}
                  columnDefs={responseColumnDefs}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  pagination
                  paginationPageSize={10}
                  animateRows
                  rowSelection="single"
                  onRowClicked={handleRowClicked}
                />
              </div>
            </GridCard>

            <GridCard title={selectedResponse ? `Response Result · ${selectedResponse.formTitle}` : "Response Result"} rows={answers.length}>
              {selectedResponse ? (
                <div className="mb-4 space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">{selectedRespondentName}</p>
                      <p className="mt-1 text-sm text-slate-500">{selectedResponse.respondentEmail || "No respondent email"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openResponsePreview}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-500"
                      >
                        <Eye className="size-4" />
                        Preview Export
                      </button>
                      <button
                        type="button"
                        disabled={isResending || !selectedResponse.respondentEmail}
                        onClick={resendResponseReviewEmail}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isResending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                        Resend Review
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteResponse(selectedResponse)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label="Respondent" value={selectedRespondentName} />
                    <SummaryCard label="Weighted Mean" value={formatNumber(selectedResponse.weightedMean)} />
                    <SummaryCard label="Interpretation" value={selectedResponse.interpretation || "No data"} />
                    <SummaryCard label="Submitted" value={formatDate(selectedResponse.submittedAt)} />
                  </div>

                  {selectedSignatureValue ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Respondent Signature</p>
                      {isImageSignatureValue(selectedSignatureValue) ? (
                        <img
                          src={selectedSignatureValue}
                          alt="Respondent signature"
                          className="mt-3 max-h-32 rounded-xl border border-cyan-200 bg-white p-3"
                        />
                      ) : (
                        <p className="mt-2 text-xl font-black text-slate-950">{selectedSignatureValue}</p>
                      )}
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
                <div className="ag-theme-quartz h-96 w-full">
                  <AgGridReact
                    rowData={answers}
                    columnDefs={answerColumnDefs}
                    defaultColDef={{ sortable: true, filter: true, resizable: true }}
                    pagination
                    paginationPageSize={10}
                    animateRows
                  />
                </div>
              )}
            </GridCard>
          </div>
        )}
      </div>

      <Preview
        isOpen={isResponsesPreviewOpen}
        title={selectedForm ? `Responses Preview Export · ${selectedForm.title}` : "Responses Preview Export"}
        subtitle={selectedFormCode ? `Filtered by ${selectedFormCode}` : "All submitted survey responses"}
        fileName={selectedFormCode ? `${selectedFormCode}-survey-responses` : "all-survey-responses"}
        summary={responsesPreviewSummary}
        rows={responses}
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

      {pendingDeleteResponse ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl shadow-slate-950/30">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                <Trash2 className="size-6" />
              </span>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Delete survey response?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This will remove the selected response and its answers from SurveyStat.
                </p>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="font-black text-slate-950">
                    {getRespondentDisplayName(
                      pendingDeleteResponse,
                      Math.max(
                        0,
                        responses.findIndex((response) => response.id === pendingDeleteResponse.id),
                      ),
                    )}
                  </p>
                  <p className="mt-1 text-slate-500">{pendingDeleteResponse.formTitle}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteResponse(null)}
                disabled={isDeleting}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteResponse}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete Response
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
      className={`rounded-2xl border p-4 text-left transition ${
        isActive ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            isActive ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {icon}
        </span>
        <span>
          <span className="line-clamp-2 block font-black text-slate-950">{title}</span>
          <span className="mt-1 line-clamp-1 block text-sm font-semibold text-slate-500">{subtitle}</span>
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
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 wrap-break-word text-2xl font-black tracking-tight text-slate-950">{value}</p>
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
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
            <Table2 className="size-5" />
          </span>
          <h2 className="text-xl font-black">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">{rows} rows</span>
        </div>
      </div>
      {children}
    </section>
  )
}

export default Respondents