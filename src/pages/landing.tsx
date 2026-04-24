import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  DatabaseZap,
  FilePlus2,
  Layers3,
  Link2,
  Loader2,
  ListChecks,
  Plus,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import logoUrl from "@/assets/images/logo.svg"
import {
  ACREDIFY_SYSTEM_URL,
  SurveyStatApiError,
  surveyStatService,
  type CreateSurveyFormPayload,
  type StatisticsSummary,
  type SurveyForm,
} from "@/api/surveystat"

const features = [
  {
    title: "Survey Collection",
    icon: ClipboardCheck,
  },
  {
    title: "Real-time Statistics",
    icon: BarChart3,
  },
  {
    title: "Interactive Tables",
    icon: DatabaseZap,
  },
]

const defaultSurveyInstruction =
  "Please read each statement carefully and place a check mark (✓) under the appropriate number that best reflects your evaluation."

function getErrorMessage(error: unknown) {
  if (error instanceof SurveyStatApiError || error instanceof Error) {
    return error.message
  }

  return "Unable to load SurveyStat data."
}

function formatNumber(value?: number | null, digits = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—"
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function getSurveyItemTotal(forms: SurveyForm[]) {
  return forms.length
}

function createCodeFromTitle(title: string, fallback: string) {
  const code = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

  return (code || fallback).slice(0, 40)
}

function getDefaultSections(stepNumber: number): CreateSurveyFormPayload["sections"] {
  return [
    {
      code: `survey_${stepNumber}_section_1`,
      title: "Survey Items",
      sortOrder: 1,
      items: [
        {
          code: `survey_${stepNumber}_item_1`,
          statement: "Replace this sample checklist item with the actual survey indicator.",
          sortOrder: 1,
          isRequired: true,
        },
      ],
    },
  ]
}

function getSurveyShareUrl(formCodes: string[]) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const codes = formCodes.map((code) => code.trim()).filter(Boolean)

  if (codes.length === 0) {
    return `${origin}/survey`
  }

  return `${origin}/survey?forms=${encodeURIComponent(codes.join(","))}`
}

type DialogShellProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

function DialogShell({ title, description, children, footer, onClose }: DialogShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-4 backdrop-blur">
      <section className="max-h-[95svh] w-full max-w-4xl overflow-auto rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/60">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-2xl font-black tracking-tight">{title}</h2>
            {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-6 py-6">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-white/10 bg-slate-950/95 px-6 py-5 backdrop-blur">
            {footer}
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function Landing() {
  const navigate = useNavigate()
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [summary, setSummary] = useState<StatisticsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [isExistingSurveysDialogOpen, setIsExistingSurveysDialogOpen] = useState(false)
  const [isCreateSurveyDialogOpen, setIsCreateSurveyDialogOpen] = useState(false)
  const [existingSurveyMode, setExistingSurveyMode] = useState<"single" | "series">("single")
  const [selectedSurveyCodes, setSelectedSurveyCodes] = useState<string[]>([])
  const [createMode, setCreateMode] = useState<"single" | "series">("single")
  const [createSurveyTitle, setCreateSurveyTitle] = useState("")
  const [createSurveyDescription, setCreateSurveyDescription] = useState("")
  const [surveyStepCount, setSurveyStepCount] = useState(2)
  const [respondentInformationRequired, setRespondentInformationRequired] = useState(true)
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false)
  const [updatingRespondentInfoFormId, setUpdatingRespondentInfoFormId] = useState<string | null>(null)

  async function loadLandingData() {
    setIsLoading(true)
    setErrorMessage("")

    try {
      const [surveyForms, statisticsSummary] = await Promise.all([
        surveyStatService.listSurveyForms(true),
        surveyStatService.getStatisticsSummary(),
      ])

      setForms(surveyForms)
      setSummary(statisticsSummary)
      setSelectedSurveyCodes((current) => {
        const availableCodes = new Set(surveyForms.map((form) => form.code))
        const preserved = current.filter((code) => availableCodes.has(code))

        return preserved.length > 0 ? preserved : surveyForms[0]?.code ? [surveyForms[0].code] : []
      })
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setIsLoading(true)
      setErrorMessage("")

      try {
        const [surveyForms, statisticsSummary] = await Promise.all([
          surveyStatService.listSurveyForms(true),
          surveyStatService.getStatisticsSummary(),
        ])

        if (!isMounted) return

        setForms(surveyForms)
        setSummary(statisticsSummary)
        setSelectedSurveyCodes(surveyForms[0]?.code ? [surveyForms[0].code] : [])
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [])

  const activeSurveyCards = useMemo(() => forms.slice(0, 4), [forms])
  const highlightedSurvey = activeSurveyCards[0]
  const selectedExistingSurveys = useMemo(
    () => forms.filter((form) => selectedSurveyCodes.includes(form.code)),
    [forms, selectedSurveyCodes],
  )

  function openExistingSurveysDialog() {
    setSelectedSurveyCodes((current) => (current.length > 0 ? current : forms[0]?.code ? [forms[0].code] : []))
    setIsExistingSurveysDialogOpen(true)
  }

  function toggleExistingSurvey(formCode: string) {
    setSelectedSurveyCodes((current) => {
      if (existingSurveyMode === "single") {
        return [formCode]
      }

      if (current.includes(formCode)) {
        const next = current.filter((code) => code !== formCode)
        return next.length > 0 ? next : [formCode]
      }

      return [...current, formCode]
    })
  }

  async function copySurveyShareLink(formCodes: string[]) {
    const shareUrl = getSurveyShareUrl(formCodes)

    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Survey share link copied.")
    } catch {
      toast.error("Unable to copy survey share link.")
    }
  }

  async function toggleExistingSurveyRespondentInformation(form: SurveyForm) {
    const nextRequired = !form.respondentInformationRequired
    setUpdatingRespondentInfoFormId(form.id)

    try {
      const updatedForm = await surveyStatService.updateSurveyFormRespondentInformation(form.id, {
        respondentInformationRequired: nextRequired,
      })

      setForms((current) => current.map((item) => (item.id === updatedForm.id ? updatedForm : item)))
      toast.success(nextRequired ? "Respondent information is required." : "Respondent information is turned off.")
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setUpdatingRespondentInfoFormId(null)
    }
  }

  function startSelectedSurveys() {
    const codes = selectedSurveyCodes.length > 0 ? selectedSurveyCodes : forms[0]?.code ? [forms[0].code] : []

    if (codes.length === 0) {
      toast.error("No active survey is available.")
      return
    }

    navigate(`/survey?forms=${encodeURIComponent(codes.join(","))}`)
  }

  async function handleCreateSurveySeries() {
    const title = createSurveyTitle.trim()

    if (!title) {
      toast.error("Please enter the survey title.")
      return
    }

    const stepCount = createMode === "series" ? Math.max(2, Math.min(surveyStepCount, 10)) : 1
    const timestamp = Date.now().toString(36)
    const baseCode = createCodeFromTitle(title, "custom_survey")

    const formsToCreate = Array.from({ length: stepCount }, (_, index) => {
      const stepNumber = index + 1
      const stepTitle = createMode === "series" ? `${title} - Survey ${stepNumber}` : title

      return {
        code: `${baseCode}_${timestamp}_${stepNumber}`,
        title: stepTitle,
        description: createSurveyDescription.trim() || "Custom survey created by the researcher.",
        instruction: defaultSurveyInstruction,
        respondentInformationRequired,
        isActive: true,
        surveySeriesId: `${baseCode}_${timestamp}`,
        surveySeriesTitle: title,
        surveyStepNumber: stepNumber,
        sections: getDefaultSections(stepNumber),
      } satisfies CreateSurveyFormPayload
    })

    setIsCreatingSurvey(true)

    try {
      const createdForms = await surveyStatService.createSurveySeries({
        surveySeriesTitle: title,
        surveySeriesId: `${baseCode}_${timestamp}`,
        forms: formsToCreate,
      })

      toast.success(createMode === "series" ? "Survey series created successfully." : "Survey created successfully.")
      setCreateSurveyTitle("")
      setCreateSurveyDescription("")
      setSurveyStepCount(2)
      setRespondentInformationRequired(true)
      setIsCreateSurveyDialogOpen(false)
      await loadLandingData()

      const createdCodes = createdForms.map((form) => form.code)
      if (createdCodes.length > 0) {
        navigate(`/survey?forms=${encodeURIComponent(createdCodes.join(","))}`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsCreatingSurvey(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-8">
        <nav className="sticky top-4 z-40 flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-cyan-400/20">
              <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
            </span>
            <span className="text-xl">SurveyStat</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={openExistingSurveysDialog}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              <ListChecks className="size-4" />
              Existing Surveys
            </button>
            <button
              type="button"
              onClick={() => setIsCreateSurveyDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/20"
            >
              <Plus className="size-4" />
              Create New Survey
            </button>
            <Link
              to="/respondents"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              <UsersRound className="size-4" />
              Respondents
            </Link>
            <Link
              to="/statistic"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Statistics
            </Link>
            {ACREDIFY_SYSTEM_URL ? (
              <a
                href={ACREDIFY_SYSTEM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
              >
                Open System
                <ArrowUpRight className="size-4" />
              </a>
            ) : null}
          </div>
        </nav>

        <div className="mt-4 flex flex-col gap-3 md:hidden">
          <button
            type="button"
            onClick={openExistingSurveysDialog}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
          >
            <ListChecks className="size-4" />
            Existing Surveys
          </button>
          <button
            type="button"
            onClick={() => setIsCreateSurveyDialogOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950"
          >
            <Plus className="size-4" />
            Create New Survey
          </button>
          <Link
            to="/respondents"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white"
          >
            <UsersRound className="size-4" />
            Respondents
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              <ShieldCheck className="size-4" />
              Digital repository survey and statistical dashboard
            </div>

            <div className="space-y-6">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white md:text-7xl">
                Collect accreditation survey responses and evaluate results faster.
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Active Surveys</p>
                <p className="mt-2 text-3xl font-black">{isLoading ? "—" : getSurveyItemTotal(forms)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Responses</p>
                <p className="mt-2 text-3xl font-black">{formatNumber(summary?.responseCount)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Weighted Mean</p>
                <p className="mt-2 text-3xl font-black">{formatNumber(summary?.weightedMean, 2)}</p>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-300/20 bg-red-400/10 px-5 py-4 text-sm font-medium text-red-100">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openExistingSurveysDialog}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-300"
              >
                <ListChecks className="size-4" />
                Existing Surveys
              </button>
              <button
                type="button"
                onClick={() => setIsCreateSurveyDialogOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <FilePlus2 className="size-4" />
                Create New Survey
              </button>
              <Link
                to="/respondents"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <UsersRound className="size-4" />
                Respondents
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-cyan-950/50 backdrop-blur">
            <div className="rounded-2xl bg-slate-900 p-5">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Survey Summary</p>
                  <h2 className="text-2xl font-bold">{highlightedSurvey?.title ?? "Active Survey Forms"}</h2>
                </div>
                <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                  Live Data
                </div>
              </div>

              {isLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-cyan-300" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-400">Answers</p>
                      <p className="mt-2 text-2xl font-black">{formatNumber(summary?.answerCount)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-400">Items</p>
                      <p className="mt-2 text-2xl font-black">{formatNumber(summary?.itemCount)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-400">Interpretation</p>
                      <p className="mt-2 text-2xl font-black">{summary?.interpretation ?? "—"}</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    {activeSurveyCards.map((form, index) => (
                      <button
                        key={form.id}
                        type="button"
                        onClick={() => {
                          setSelectedSurveyCodes([form.code])
                          setIsExistingSurveysDialogOpen(true)
                        }}
                        className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-200">
                              Survey {form.surveyStepNumber || index + 1}
                            </p>
                            <h3 className="mt-1 font-bold">{form.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{form.description}</p>
                          </div>
                          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-200">
                            {form.respondentInformationRequired ? "Info required" : "Info off"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-6 space-y-3">
                {features.map((feature) => (
                  <div key={feature.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                      <feature.icon className="size-5" />
                    </span>
                    <div className="flex min-h-10 items-center">
                      <h3 className="font-bold">{feature.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isExistingSurveysDialogOpen ? (
        <DialogShell
          title="Existing Surveys"
          onClose={() => setIsExistingSurveysDialogOpen(false)}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-300">
                {selectedExistingSurveys.length} selected survey{selectedExistingSurveys.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => copySurveyShareLink(selectedSurveyCodes)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  <Copy className="size-4" />
                  Copy Share Link
                </button>
                <button
                  type="button"
                  onClick={startSelectedSurveys}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
                >
                  <ArrowUpRight className="size-4" />
                  Start Selected
                </button>
              </div>
            </div>
          }
        >
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setExistingSurveyMode("single")
                setSelectedSurveyCodes((current) => [current[0] ?? forms[0]?.code ?? ""])
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                existingSurveyMode === "single"
                  ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <ListChecks className="mb-3 size-5" />
              <p className="font-black">Single survey</p>
            </button>
            <button
              type="button"
              onClick={() => setExistingSurveyMode("series")}
              className={`rounded-2xl border p-4 text-left transition ${
                existingSurveyMode === "series"
                  ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <Layers3 className="mb-3 size-5" />
              <p className="font-black">Survey series</p>
            </button>
          </div>

          <div className="grid gap-3">
            {forms.map((form, index) => {
              const isSelected = selectedSurveyCodes.includes(form.code)
              const isUpdatingRespondentInfo = updatingRespondentInfoFormId === form.id

              return (
                <div
                  key={form.id}
                  className={`rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-cyan-300 bg-cyan-300/10 shadow-lg shadow-cyan-950/20"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <button type="button" onClick={() => toggleExistingSurvey(form.code)} className="flex-1 text-left">
                      <span className="text-xs font-black uppercase tracking-wide text-cyan-200">
                        Survey {form.surveyStepNumber || index + 1}
                      </span>
                      <span className="mt-1 block text-lg font-black">{form.title}</span>
                      <span className="mt-2 line-clamp-2 block text-sm leading-6 text-slate-400">{form.description}</span>
                    </button>

                    <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-500"
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="size-5" /> : index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => copySurveyShareLink([form.code])}
                        className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-200 transition hover:bg-white/15 hover:text-white"
                      >
                        <Link2 className="size-3.5" />
                        Share
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.respondentInformationRequired}
                        disabled={isUpdatingRespondentInfo}
                        onClick={() => toggleExistingSurveyRespondentInformation(form)}
                        className={`inline-flex items-center gap-3 rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          form.respondentInformationRequired ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-300"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-10 items-center rounded-full p-0.5 transition ${
                            form.respondentInformationRequired ? "bg-slate-950/20" : "bg-slate-950/60"
                          }`}
                        >
                          <span
                            className={`size-4 rounded-full bg-white transition ${
                              form.respondentInformationRequired ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </span>
                        {isUpdatingRespondentInfo ? "Saving" : form.respondentInformationRequired ? "Required" : "Off"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </DialogShell>
      ) : null}

      {isCreateSurveyDialogOpen ? (
        <DialogShell
          title="Create New Survey"
          onClose={() => setIsCreateSurveyDialogOpen(false)}
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-300">
                {createMode === "series" ? `${surveyStepCount} survey steps will be created.` : "One survey will be created."}
              </p>
              <button
                type="button"
                onClick={handleCreateSurveySeries}
                disabled={isCreatingSurvey}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {isCreatingSurvey ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
                Create Survey
              </button>
            </div>
          }
        >
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCreateMode("single")}
                className={`rounded-2xl border p-4 text-left transition ${
                  createMode === "single"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <ListChecks className="mb-3 size-5" />
                <p className="font-black">Create one survey</p>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("series")}
                className={`rounded-2xl border p-4 text-left transition ${
                  createMode === "series"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <Layers3 className="mb-3 size-5" />
                <p className="font-black">Create survey series</p>
              </button>
            </div>

            <label className="block">
              <span className="text-sm font-black text-slate-200">Survey Title</span>
              <input
                value={createSurveyTitle}
                onChange={(event) => setCreateSurveyTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="Enter survey title"
              />
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-200">Description</span>
              <textarea
                value={createSurveyDescription}
                onChange={(event) => setCreateSurveyDescription(event.target.value)}
                className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="Describe the purpose of the survey"
              />
            </label>

            {createMode === "series" ? (
              <div>
                <p className="text-sm font-black text-slate-200">Number of survey steps</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[2, 3, 4, 5, 6].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSurveyStepCount(count)}
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${
                        surveyStepCount === count
                          ? "bg-cyan-400 text-slate-950"
                          : "bg-white/10 text-slate-300 hover:bg-white/15"
                      }`}
                    >
                      {count} surveys
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              role="switch"
              aria-checked={respondentInformationRequired}
              onClick={() => setRespondentInformationRequired((current) => !current)}
              className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                respondentInformationRequired
                  ? "border-cyan-300 bg-cyan-300/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <span>
                <span className="block font-black text-white">Respondent Information</span>
              </span>
              <span
                className={`flex h-8 w-16 items-center rounded-full p-1 transition ${
                  respondentInformationRequired ? "bg-cyan-400" : "bg-white/10"
                }`}
              >
                <span
                  className={`size-6 rounded-full bg-white transition ${
                    respondentInformationRequired ? "translate-x-8" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          </div>
        </DialogShell>
      ) : null}
    </main>
  )
}

export default Landing