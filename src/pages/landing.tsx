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
  Menu,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 px-2 py-2 backdrop-blur sm:items-center sm:px-4 sm:py-4" role="dialog" aria-modal="true">
      <section className="flex max-h-[calc(100svh-1rem)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/60 sm:max-h-[95svh] sm:max-w-4xl sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-3 py-4 backdrop-blur sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <h2 className="max-w-full wrap-break-word text-lg font-black tracking-tight sm:text-2xl">{title}</h2>
            {description ? <p className="mt-2 max-w-full text-sm leading-6 text-slate-300 wrap-anywhere sm:max-w-2xl">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-3 py-4 backdrop-blur sm:px-6 sm:py-5">
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
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false)

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

  function closeMobileNavigation() {
    setIsMobileNavigationOpen(false)
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
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full min-w-0 max-w-7xl flex-col px-2 pb-3 pt-20 sm:px-6 sm:pb-8 sm:pt-28 lg:px-8">
        <nav className="fixed inset-x-2 top-3 z-40 mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/90 px-2 py-2 shadow-2xl shadow-slate-950/30 backdrop-blur sm:inset-x-6 sm:top-4 sm:rounded-3xl sm:px-5 sm:py-4 lg:inset-x-8">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight sm:gap-3" onClick={closeMobileNavigation}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-cyan-400/20 sm:size-12">
              <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
            </span>
            <span className="min-w-0 max-w-full truncate text-base sm:max-w-none sm:text-xl">SurveyStat</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsMobileNavigationOpen((current) => !current)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 sm:size-11 md:hidden"
            aria-controls="landing-mobile-navigation"
            aria-expanded={isMobileNavigationOpen}
            aria-label="Toggle navigation menu"
          >
            {isMobileNavigationOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

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

        {isMobileNavigationOpen ? (
          <div id="landing-mobile-navigation" className="fixed inset-x-2 top-20 z-30 mx-auto flex w-auto max-w-7xl min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/40 backdrop-blur sm:inset-x-6 sm:top-24 sm:gap-3 sm:p-3 lg:inset-x-8 md:hidden">
            <button
              type="button"
              onClick={() => {
                closeMobileNavigation()
                openExistingSurveysDialog()
              }}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-white sm:px-4 sm:text-sm"
            >
              <ListChecks className="size-4" />
              Existing Surveys
            </button>
            <button
              type="button"
              onClick={() => {
                closeMobileNavigation()
                setIsCreateSurveyDialogOpen(true)
              }}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-3 py-3 text-xs font-bold text-slate-950 sm:px-4 sm:text-sm"
            >
              <Plus className="size-4" />
              Create New Survey
            </button>
            <Link
              to="/respondents"
              onClick={closeMobileNavigation}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-white sm:px-4 sm:text-sm"
            >
              <UsersRound className="size-4" />
              Respondents
            </Link>
            <Link
              to="/statistic"
              onClick={closeMobileNavigation}
              className="inline-flex min-w-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-white sm:px-4 sm:text-sm"
            >
              Statistics
            </Link>
            {ACREDIFY_SYSTEM_URL ? (
              <a
                href={ACREDIFY_SYSTEM_URL}
                target="_blank"
                rel="noreferrer"
                onClick={closeMobileNavigation}
                className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-3 py-3 text-xs font-bold text-slate-950 sm:px-4 sm:text-sm"
              >
                Open System
                <ArrowUpRight className="size-4" />
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="grid min-w-0 flex-1 items-center gap-6 py-8 sm:gap-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 space-y-6 sm:space-y-8">
            <div className="inline-flex w-full max-w-full items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 wrap-anywhere sm:w-auto sm:max-w-none sm:rounded-full sm:px-4 sm:text-sm">
              <ShieldCheck className="size-4 shrink-0" />
              Digital repository survey and statistical dashboard
            </div>

            <div className="space-y-6">
              <h1 className="max-w-full text-2xl font-black tracking-tight text-white wrap-anywhere sm:max-w-4xl sm:text-5xl md:text-7xl">
                Collect accreditation survey responses and evaluate results faster.
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <p className="text-sm text-slate-400">Active Surveys</p>
                <p className="mt-2 max-w-full truncate text-2xl font-black sm:max-w-none sm:text-3xl">{isLoading ? "—" : getSurveyItemTotal(forms)}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <p className="text-sm text-slate-400">Responses</p>
                <p className="mt-2 max-w-full truncate text-2xl font-black sm:max-w-none sm:text-3xl">{formatNumber(summary?.responseCount)}</p>
              </div>
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <p className="text-sm text-slate-400">Weighted Mean</p>
                <p className="mt-2 max-w-full truncate text-2xl font-black sm:max-w-none sm:text-3xl">{formatNumber(summary?.weightedMean, 2)}</p>
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
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-3 py-3 text-xs font-bold text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-300 sm:w-auto sm:px-6 sm:text-sm"
              >
                <ListChecks className="size-4" />
                Existing Surveys
              </button>
              <button
                type="button"
                onClick={() => setIsCreateSurveyDialogOpen(true)}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-xs font-bold text-white transition hover:bg-white/10 sm:w-auto sm:px-6 sm:text-sm"
              >
                <FilePlus2 className="size-4" />
                Create New Survey
              </button>
              <Link
                to="/respondents"
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-3 text-xs font-bold text-white transition hover:bg-white/10 sm:w-auto sm:px-6 sm:text-sm"
              >
                <UsersRound className="size-4" />
                Respondents
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-cyan-950/50 backdrop-blur sm:rounded-3xl sm:p-4">
            <div className="min-w-0 rounded-2xl bg-slate-900 p-3 sm:p-5">
              <div className="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-400">Survey Summary</p>
                  <h2 className="mt-1 line-clamp-2 max-w-full text-lg font-bold wrap-anywhere sm:max-w-none sm:text-2xl">{highlightedSurvey?.title ?? "Active Survey Forms"}</h2>
                </div>
                <div className="w-fit shrink-0 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 sm:text-sm">
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
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                      <p className="text-sm text-slate-400">Answers</p>
                      <p className="mt-2 max-w-full truncate text-2xl font-black">{formatNumber(summary?.answerCount)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                      <p className="text-sm text-slate-400">Items</p>
                      <p className="mt-2 max-w-full truncate text-2xl font-black">{formatNumber(summary?.itemCount)}</p>
                    </div>
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                      <p className="text-sm text-slate-400">Interpretation</p>
                      <p className="mt-2 max-w-full truncate text-2xl font-black sm:max-w-none">{summary?.interpretation ?? "—"}</p>
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
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-200">
                              Survey {form.surveyStepNumber || index + 1}
                            </p>
                            <h3 className="mt-1 line-clamp-2 max-w-full font-bold wrap-anywhere sm:max-w-none">{form.title}</h3>
                            <p className="mt-1 line-clamp-2 max-w-full text-sm leading-6 text-slate-400 wrap-anywhere sm:max-w-none">{form.description}</p>
                          </div>
                          <span className="w-fit shrink-0 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-200">
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
                  <div key={feature.title} className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                      <feature.icon className="size-5" />
                    </span>
                    <div className="flex min-h-10 min-w-0 items-center">
                      <h3 className="max-w-full truncate font-bold sm:max-w-none">{feature.title}</h3>
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
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-full wrap-break-word text-sm font-semibold text-slate-300">
                {selectedExistingSurveys.length} selected survey{selectedExistingSurveys.length === 1 ? "" : "s"}
              </p>
              <div className="grid w-full min-w-0 gap-3 sm:w-auto sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => copySurveyShareLink(selectedSurveyCodes)}
                  className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 sm:px-5"
                >
                  <Copy className="size-4 shrink-0" />
                  <span className="truncate">Copy Share Link</span>
                </button>
                <button
                  type="button"
                  onClick={startSelectedSurveys}
                  className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:px-5"
                >
                  <ArrowUpRight className="size-4 shrink-0" />
                  <span className="truncate">Start Selected</span>
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
              className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                existingSurveyMode === "single"
                  ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <ListChecks className="mb-3 size-5" />
              <p className="wrap-break-word font-black">Single survey</p>
            </button>
            <button
              type="button"
              onClick={() => setExistingSurveyMode("series")}
              className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                existingSurveyMode === "series"
                  ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              <Layers3 className="mb-3 size-5" />
              <p className="wrap-break-word font-black">Survey series</p>
            </button>
          </div>

          <div className="grid min-w-0 gap-3">
            {forms.map((form, index) => {
              const isSelected = selectedSurveyCodes.includes(form.code)
              const isUpdatingRespondentInfo = updatingRespondentInfoFormId === form.id

              return (
                <div
                  key={form.id}
                  className={`min-w-0 rounded-2xl border p-3 transition sm:p-4 ${
                    isSelected
                      ? "border-cyan-300 bg-cyan-300/10 shadow-lg shadow-cyan-950/20"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <button type="button" onClick={() => toggleExistingSurvey(form.code)} className="min-w-0 flex-1 text-left">
                      <span className="text-xs font-black uppercase tracking-wide text-cyan-200">
                        Survey {form.surveyStepNumber || index + 1}
                      </span>
                      <span className="mt-1 block max-w-full wrap-break-word text-base font-black sm:text-lg">{form.title}</span>
                      <span className="mt-2 line-clamp-3 block max-w-full text-sm leading-6 text-slate-400 wrap-anywhere sm:line-clamp-2">{form.description}</span>
                    </button>

                    <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:w-auto sm:items-end sm:gap-3">
                      <span
                        className={`flex h-9 min-w-0 shrink-0 items-center justify-center rounded-xl px-3 sm:size-9 sm:px-0 ${
                          isSelected ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-500"
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="size-5" /> : index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => copySurveyShareLink([form.code])}
                        className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-200 transition hover:bg-white/15 hover:text-white sm:w-auto"
                      >
                        <Link2 className="size-3.5 shrink-0" />
                        <span className="truncate">Share</span>
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.respondentInformationRequired}
                        disabled={isUpdatingRespondentInfo}
                        onClick={() => toggleExistingSurveyRespondentInformation(form)}
                        className={`inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:gap-3 ${
                          form.respondentInformationRequired ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-300"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-10 shrink-0 items-center rounded-full p-0.5 transition ${
                            form.respondentInformationRequired ? "bg-slate-950/20" : "bg-slate-950/60"
                          }`}
                        >
                          <span
                            className={`size-4 rounded-full bg-white transition ${
                              form.respondentInformationRequired ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </span>
                        <span className="truncate">{isUpdatingRespondentInfo ? "Saving" : form.respondentInformationRequired ? "Required" : "Off"}</span>
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
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-full wrap-break-word text-sm font-semibold text-slate-300">
                {createMode === "series" ? `${surveyStepCount} survey steps will be created.` : "One survey will be created."}
              </p>
              <button
                type="button"
                onClick={handleCreateSurveySeries}
                disabled={isCreatingSurvey}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
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
                className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                  createMode === "single"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <ListChecks className="mb-3 size-5" />
                <p className="wrap-break-word font-black">Create one survey</p>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("series")}
                className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                  createMode === "series"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <Layers3 className="mb-3 size-5" />
                <p className="wrap-break-word font-black">Create survey series</p>
              </button>
            </div>

            <label className="block min-w-0">
              <span className="text-sm font-black text-slate-200">Survey Title</span>
              <input
                value={createSurveyTitle}
                onChange={(event) => setCreateSurveyTitle(event.target.value)}
                className="mt-2 w-full max-w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="Enter survey title"
              />
            </label>

            <label className="block min-w-0">
              <span className="text-sm font-black text-slate-200">Description</span>
              <textarea
                value={createSurveyDescription}
                onChange={(event) => setCreateSurveyDescription(event.target.value)}
                className="mt-2 min-h-28 w-full max-w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
                placeholder="Describe the purpose of the survey"
              />
            </label>

            {createMode === "series" ? (
              <div className="min-w-0">
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
              className={`flex w-full max-w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                respondentInformationRequired
                  ? "border-cyan-300 bg-cyan-300/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <span className="min-w-0">
                <span className="block wrap-break-word font-black text-white">Respondent Information</span>
              </span>
              <span
                className={`flex h-8 w-16 shrink-0 items-center rounded-full p-1 transition ${
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