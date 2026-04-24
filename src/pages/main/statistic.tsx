import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community"
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Table2,
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import "ag-grid-community/styles/ag-grid.css"
import "ag-grid-community/styles/ag-theme-quartz.css"

import {
  SurveyStatApiError,
  surveyStatService,
  type LikertValue,
  type StatisticsFilters,
  type StatisticsSummary,
  type SurveyForm,
  type SurveyFormStatistics,
  type SurveyItemStatistics,
  type SurveySectionStatistics,
} from "@/api/surveystat"

ModuleRegistry.registerModules([AllCommunityModule])

type DistributionDatum = {
  rating: string
  count: number
}

type PlotlyChartProps = {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
  config?: Record<string, unknown>
  useResizeHandler?: boolean
  className?: string
  style?: CSSProperties
}

type PlotlyComponent = ComponentType<PlotlyChartProps>

let plotlyComponentPromise: Promise<PlotlyComponent> | null = null

const defaultSummary: StatisticsSummary = {
  responseCount: 0,
  itemCount: 0,
  answerCount: 0,
  count: 0,
  mean: 0,
  weightedMean: 0,
  standardDeviation: 0,
  variance: 0,
  minimum: 0,
  maximum: 0,
  total: 0,
  distribution: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  },
  interpretation: "No data",
  meanRange: "N/A",
}

function getErrorMessage(error: unknown) {
  if (error instanceof SurveyStatApiError || error instanceof Error) {
    return error.message
  }

  return "Unable to load statistics. Please try again."
}

function toDistributionData(distribution: Record<LikertValue, number>): DistributionDatum[] {
  return ([1, 2, 3, 4, 5] as LikertValue[]).map((rating) => ({
    rating: String(rating),
    count: distribution[rating] ?? 0,
  }))
}

function getFormFilterValue(formCode: string): StatisticsFilters {
  return formCode ? { formCode } : {}
}

function getSelectedFormTitle(forms: SurveyForm[], formCode: string) {
  return forms.find((form) => form.code === formCode)?.title ?? "Select a survey form"
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function createFallbackCalculation(summary: StatisticsSummary) {
  const weightedTotal = ([1, 2, 3, 4, 5] as LikertValue[]).reduce(
    (total, rating) => total + rating * (summary.distribution[rating] ?? 0),
    0,
  )

  return [
    {
      label: "Frequency count",
      formula: "f = count of responses per Likert rating",
      substitution: `1=${summary.distribution[1]}, 2=${summary.distribution[2]}, 3=${summary.distribution[3]}, 4=${summary.distribution[4]}, 5=${summary.distribution[5]}`,
      result: `${summary.answerCount} total answers`,
    },
    {
      label: "Weighted total",
      formula: "Σ(xf)",
      substitution: `1(${summary.distribution[1]}) + 2(${summary.distribution[2]}) + 3(${summary.distribution[3]}) + 4(${summary.distribution[4]}) + 5(${summary.distribution[5]})`,
      result: `${weightedTotal}`,
    },
    {
      label: "Weighted mean",
      formula: "Σ(xf) / N",
      substitution: `${weightedTotal} / ${summary.answerCount || 1}`,
      result: formatNumber(summary.weightedMean),
    },
    {
      label: "Interpretation",
      formula: "Weighted mean matched to the Likert mean range",
      substitution: `${formatNumber(summary.weightedMean)} belongs to ${summary.meanRange}`,
      result: summary.interpretation,
    },
  ]
}

function installPlotlyGlobalShim() {
  if (typeof globalThis === "undefined") return

  const runtimeGlobal = globalThis as typeof globalThis & {
    global?: typeof globalThis
  }

  if (!runtimeGlobal.global) {
    runtimeGlobal.global = globalThis
  }
}

function resolvePlotlyComponent(moduleValue: unknown): PlotlyComponent {
  let candidate = moduleValue

  for (let index = 0; index < 4; index += 1) {
    if (typeof candidate === "function") {
      return candidate as PlotlyComponent
    }

    if (candidate && typeof candidate === "object" && "default" in candidate) {
      candidate = (candidate as { default: unknown }).default
      continue
    }

    break
  }

  throw new Error("Unable to load Plotly chart component.")
}

async function loadPlotlyComponent() {
  installPlotlyGlobalShim()

  if (!plotlyComponentPromise) {
    plotlyComponentPromise = import("react-plotly.js").then(resolvePlotlyComponent)
  }

  return plotlyComponentPromise
}

function PlotlyChart(props: PlotlyChartProps) {
  const [PlotComponent, setPlotComponent] = useState<PlotlyComponent | null>(null)
  const [plotlyErrorMessage, setPlotlyErrorMessage] = useState("")

  useEffect(() => {
    let isMounted = true

    loadPlotlyComponent()
      .then((component) => {
        if (isMounted) {
          setPlotComponent(() => component)
        }
      })
      .catch((error) => {
        if (isMounted) {
          setPlotlyErrorMessage(getErrorMessage(error))
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (plotlyErrorMessage) {
    return <EmptyChartState message={plotlyErrorMessage} />
  }

  if (!PlotComponent) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl bg-slate-50">
        <Loader2 className="size-8 animate-spin text-cyan-600" />
      </div>
    )
  }

  return <PlotComponent {...props} />
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-96 items-center justify-center rounded-2xl bg-slate-50 p-6 text-center">
      <p className="max-w-sm text-sm font-semibold leading-6 text-slate-500">{message}</p>
    </div>
  )
}

export function Statistic() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [summary, setSummary] = useState<StatisticsSummary>(defaultSummary)
  const [formStatistics, setFormStatistics] = useState<SurveyFormStatistics[]>([])
  const [sectionStatistics, setSectionStatistics] = useState<SurveySectionStatistics[]>([])
  const [itemStatistics, setItemStatistics] = useState<SurveyItemStatistics[]>([])
  const [isFormsLoading, setIsFormsLoading] = useState(true)
  const [isComputing, setIsComputing] = useState(false)
  const [hasComputed, setHasComputed] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const distributionData = useMemo(() => toDistributionData(summary.distribution), [summary.distribution])
  const formChartLabels = useMemo(() => formStatistics.map((item) => item.formTitle), [formStatistics])
  const formChartMeans = useMemo(() => formStatistics.map((item) => item.weightedMean), [formStatistics])
  const selectedFormTitle = useMemo(() => getSelectedFormTitle(forms, selectedFormCode), [forms, selectedFormCode])
  const calculationSteps = summary.calculation?.steps ?? createFallbackCalculation(summary)

  const sectionColumnDefs = useMemo<ColDef<SurveySectionStatistics>[]>(
    () => [
      { field: "formTitle", headerName: "Form", minWidth: 220, flex: 1 },
      { field: "sectionTitle", headerName: "Section", minWidth: 260, flex: 1 },
      { field: "count", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "standardDeviation", headerName: "Std. Dev.", width: 130 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 180, flex: 1 },
      { field: "meanRange", headerName: "Mean Range", width: 140 },
    ],
    [],
  )

  const itemColumnDefs = useMemo<ColDef<SurveyItemStatistics>[]>(
    () => [
      { field: "formTitle", headerName: "Form", minWidth: 220, flex: 1 },
      { field: "sectionTitle", headerName: "Section", minWidth: 220, flex: 1 },
      { field: "itemCode", headerName: "Code", width: 120 },
      { field: "itemStatement", headerName: "Item Statement", minWidth: 360, flex: 2 },
      { field: "count", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "standardDeviation", headerName: "Std. Dev.", width: 130 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 180, flex: 1 },
      { field: "meanRange", headerName: "Mean Range", width: 140 },
    ],
    [],
  )

  async function loadForms() {
    setIsFormsLoading(true)
    setErrorMessage("")

    try {
      const surveyForms = await surveyStatService.listSurveyForms(true)
      setForms(surveyForms)
    } catch (error) {
      const message = getErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsFormsLoading(false)
    }
  }

  async function loadStatistics(formCode = selectedFormCode) {
    if (!formCode) {
      toast.error("Please select a survey before computing statistics.")
      return
    }

    setIsComputing(true)
    setErrorMessage("")

    try {
      const nextFilters = getFormFilterValue(formCode)
      const [summaryData, formData, sectionData, itemData] = await Promise.all([
        surveyStatService.getStatisticsSummary(nextFilters),
        surveyStatService.getFormStatistics(nextFilters),
        surveyStatService.getSectionStatistics(nextFilters),
        surveyStatService.getItemStatistics(nextFilters),
      ])

      setSummary(summaryData)
      setFormStatistics(formData)
      setSectionStatistics(sectionData)
      setItemStatistics(itemData)
      setHasComputed(true)
    } catch (error) {
      const message = getErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsComputing(false)
    }
  }

  function selectSurvey(formCode: string) {
    setSelectedFormCode(formCode)
    setHasComputed(false)
    setSummary(defaultSummary)
    setFormStatistics([])
    setSectionStatistics([])
    setItemStatistics([])
  }

  useEffect(() => {
    loadForms()
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
                  <BarChart3 className="size-6" />
                </span>
                <div>
                  <h1 className="text-3xl font-black tracking-tight md:text-4xl">Survey Statistics</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Select one survey first, then compute descriptive statistics with a detailed weighted-mean solution.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={!selectedFormCode || isComputing}
                onClick={() => loadStatistics(selectedFormCode)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {isComputing ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
                Compute Selected Survey
              </button>
              <button
                type="button"
                onClick={() => (hasComputed ? loadStatistics(selectedFormCode) : loadForms())}
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
              <h2 className="text-xl font-black">Choose Survey to Compute</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Statistics are computed only after selecting a specific survey form.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
              {selectedFormCode ? selectedFormTitle : "No survey selected"}
            </span>
          </div>

          {isFormsLoading ? (
            <div className="flex min-h-40 items-center justify-center rounded-2xl bg-slate-50">
              <Loader2 className="size-8 animate-spin text-cyan-600" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {forms.map((form) => {
                const isSelected = selectedFormCode === form.code

                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => selectSurvey(form.code)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="size-5" /> : form.surveyStepNumber ?? 1}
                      </span>
                      <span>
                        <span className="block text-xs font-black uppercase tracking-wide text-cyan-700">
                          {form.code}
                        </span>
                        <span className="mt-1 block font-black text-slate-950">{form.title}</span>
                        <span className="mt-2 line-clamp-2 block text-sm leading-6 text-slate-500">{form.description}</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {!hasComputed ? (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <Calculator className="mx-auto size-12 text-slate-300" />
            <h2 className="mt-4 text-2xl font-black">No computed result yet</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Select a survey card above and click Compute Selected Survey to show the rating distribution, weighted mean,
              interpretation, and detailed solution.
            </p>
          </section>
        ) : isComputing ? (
          <div className="flex min-h-96 items-center justify-center rounded-3xl bg-white shadow-sm">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <MethodReferenceCard />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Responses" value={summary.responseCount} />
              <SummaryCard label="Answer Count" value={summary.answerCount} />
              <SummaryCard label="Weighted Mean" value={summary.weightedMean.toFixed(2)} />
              <SummaryCard label="Interpretation" value={summary.interpretation} />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Rating Distribution">
                <PlotlyChart
                  data={[
                    {
                      x: distributionData.map((item) => item.rating),
                      y: distributionData.map((item) => item.count),
                      type: "bar",
                      marker: { line: { width: 1 } },
                    },
                  ]}
                  layout={{
                    autosize: true,
                    title: { text: `Responses by Likert Rating · ${selectedFormTitle}` },
                    xaxis: { title: { text: "Likert Rating" } },
                    yaxis: { title: { text: "Count" }, rangemode: "tozero" },
                    margin: { l: 50, r: 20, t: 50, b: 50 },
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  useResizeHandler
                  className="h-96 w-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </ChartCard>

              <ChartCard title="Weighted Mean by Selected Form">
                <PlotlyChart
                  data={[
                    {
                      labels: formChartLabels,
                      values: formChartMeans,
                      type: "pie",
                      hole: 0.45,
                    },
                  ]}
                  layout={{
                    autosize: true,
                    title: { text: "Selected Survey Weighted Mean" },
                    margin: { l: 20, r: 20, t: 50, b: 20 },
                    showlegend: true,
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  useResizeHandler
                  className="h-96 w-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </ChartCard>
            </section>

            <CalculationSolution title={`Detailed Solution · ${selectedFormTitle}`}>
              <div className="grid gap-3">
                {calculationSteps.map((step, index) => (
                  <div key={`${step.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black uppercase tracking-wide text-cyan-700">
                      Step {index + 1}: {step.label}
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <SolutionBlock label="Formula" value={step.formula} />
                      <SolutionBlock label="Substitution" value={step.substitution} />
                      <SolutionBlock label="Result" value={step.result} />
                    </div>
                  </div>
                ))}
              </div>
            </CalculationSolution>

            <GridCard title="Section Statistics" rows={sectionStatistics.length}>
              <div className="ag-theme-quartz h-96 w-full">
                <AgGridReact
                  rowData={sectionStatistics}
                  columnDefs={sectionColumnDefs}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  theme="legacy"
                  pagination
                  paginationPageSize={10}
                  paginationPageSizeSelector={[10, 20, 50, 100]}
                  animateRows
                />
              </div>
            </GridCard>

            <GridCard title="Item Statistics" rows={itemStatistics.length}>
              <div className="ag-theme-quartz h-96 w-full">
                <AgGridReact
                  rowData={itemStatistics}
                  columnDefs={itemColumnDefs}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  theme="legacy"
                  pagination
                  paginationPageSize={10}
                  paginationPageSizeSelector={[10, 20, 50, 100]}
                  animateRows
                />
              </div>
            </GridCard>
          </div>
        )}
      </div>
    </main>
  )
}

function MethodReferenceCard() {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <BookOpenCheck className="size-6" />
        </span>
        <div>
          <h2 className="text-xl font-black">Statistical and Survey Reference</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            This statistics page follows an SPSS-inspired descriptive statistics workflow: frequency distribution, mean,
            weighted mean, variance, standard deviation, and interpretation by Likert mean range. ANOVA is an inferential
            method for comparing group means and can be added later when respondent groups need to be tested. The survey
            checklist flow is inspired by Google Forms because respondents answer shareable form links and submit responses
            digitally.
          </p>
        </div>
      </div>
    </section>
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
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  )
}

type ChartCardProps = {
  title: string
  children: ReactNode
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

type CalculationSolutionProps = {
  title: string
  children: ReactNode
}

function CalculationSolution({ title, children }: CalculationSolutionProps) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <Calculator className="size-5" />
        </span>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  )
}

type SolutionBlockProps = {
  label: string
  value: string
}

function SolutionBlock({ label, value }: SolutionBlockProps) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 wrap-break-word text-sm font-bold leading-6 text-slate-700">{value}</p>
    </div>
  )
}

type GridCardProps = {
  title: string
  rows: number
  children: ReactNode
}

function GridCard({ title, rows, children }: GridCardProps) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
            <Table2 className="size-5" />
          </span>
          <h2 className="text-xl font-black">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">{rows} rows</span>
      </div>
      {children}
    </section>
  )
}

export default Statistic