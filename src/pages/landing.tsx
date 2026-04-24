import { useEffect, useMemo, useState } from "react"
import { ArrowUpRight, BarChart3, ClipboardCheck, DatabaseZap, Loader2, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import logoUrl from "@/assets/images/logo.svg"
import {
  ACREDIFY_SYSTEM_URL,
  SurveyStatApiError,
  surveyStatService,
  type StatisticsSummary,
  type SurveyForm,
} from "@/api/surveystat"

const features = [
  {
    title: "Survey Collection",
    description: "Collect consent and Likert-scale checklist answers through guided survey steps.",
    icon: ClipboardCheck,
  },
  {
    title: "Real-time Statistics",
    description: "Review weighted means, interpretation ranges, distributions, and response counts from actual submissions.",
    icon: BarChart3,
  },
  {
    title: "Interactive Tables",
    description: "Inspect survey sections and item-level statistics through connected data tables.",
    icon: DatabaseZap,
  },
]

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

export function Landing() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [summary, setSummary] = useState<StatisticsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    let isMounted = true

    async function loadLandingData() {
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
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadLandingData()

    return () => {
      isMounted = false
    }
  }, [])

  const activeSurveyCards = useMemo(() => forms.slice(0, 4), [forms])
  const highlightedSurvey = activeSurveyCards[0]

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-8">
        <nav className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-cyan-400/20">
              <img src={logoUrl} alt="SurveyStat logo" className="size-full object-contain" />
            </span>
            <span className="text-xl">SurveyStat</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/survey"
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              Survey
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
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                SurveyStat connects active checklist questionnaires with real response statistics for evaluating the
                AACCUP digital repository system and current accreditation evidence processes.
              </p>
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
              <Link
                to="/survey"
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-300"
              >
                Answer Survey
              </Link>
              <Link
                to="/statistic"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View Statistics
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
                    {activeSurveyCards.map((form) => (
                      <Link
                        key={form.id}
                        to={`/survey?form=${encodeURIComponent(form.code)}`}
                        className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-bold">{form.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{form.description}</p>
                          </div>
                          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-200">
                            {form.respondentInformationRequired ? "Info required" : "Info optional"}
                          </span>
                        </div>
                      </Link>
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
                    <div>
                      <h3 className="font-bold">{feature.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Landing