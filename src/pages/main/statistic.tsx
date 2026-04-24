import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community"
import Plot from "react-plotly.js"
import { ArrowLeft, BarChart3, Loader2, RefreshCcw, Table2 } from "lucide-react"
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

export function Statistic() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [summary, setSummary] = useState<StatisticsSummary>(defaultSummary)
  const [formStatistics, setFormStatistics] = useState<SurveyFormStatistics[]>([])
  const [sectionStatistics, setSectionStatistics] = useState<SurveySectionStatistics[]>([])
  const [itemStatistics, setItemStatistics] = useState<SurveyItemStatistics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  const distributionData = useMemo(() => toDistributionData(summary.distribution), [summary.distribution])
  const formChartLabels = useMemo(() => formStatistics.map((item) => item.formTitle), [formStatistics])
  const formChartMeans = useMemo(() => formStatistics.map((item) => item.weightedMean), [formStatistics])

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

  async function loadStatistics(formCode = selectedFormCode) {
    setIsLoading(true)
    setErrorMessage("")

    try {
      const nextFilters = getFormFilterValue(formCode)
      const [surveyForms, summaryData, formData, sectionData, itemData] = await Promise.all([
        surveyStatService.listSurveyForms(true),
        surveyStatService.getStatisticsSummary(nextFilters),
        surveyStatService.getFormStatistics(nextFilters),
        surveyStatService.getSectionStatistics(nextFilters),
        surveyStatService.getItemStatistics(nextFilters),
      ])

      setForms(surveyForms)
      setSummary(summaryData)
      setFormStatistics(formData)
      setSectionStatistics(sectionData)
      setItemStatistics(itemData)
    } catch (error) {
      const message = getErrorMessage(error)
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStatistics("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isLoading) return

    loadStatistics(selectedFormCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormCode])

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-8 rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
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
                    Review descriptive statistics, weighted means, interpretations, and rating distributions.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedFormCode}
                onChange={(event) => setSelectedFormCode(event.target.value)}
                className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none"
              >
                <option value="">All Survey Forms</option>
                {forms.map((form) => (
                  <option key={form.id} value={form.code}>
                    {form.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadStatistics(selectedFormCode)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
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

        {isLoading ? (
          <div className="flex min-h-96 items-center justify-center rounded-3xl bg-white shadow-sm">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Responses" value={summary.responseCount} />
              <SummaryCard label="Answer Count" value={summary.answerCount} />
              <SummaryCard label="Weighted Mean" value={summary.weightedMean.toFixed(2)} />
              <SummaryCard label="Interpretation" value={summary.interpretation} />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Rating Distribution">
                <Plot
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
                    title: { text: "Responses by Likert Rating" },
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

              <ChartCard title="Weighted Mean by Form">
                <Plot
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
                    title: { text: "Form Weighted Mean Share" },
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

            <GridCard title="Section Statistics" rows={sectionStatistics.length}>
              <div className="ag-theme-quartz h-96 w-full">
                <AgGridReact
                  rowData={sectionStatistics}
                  columnDefs={sectionColumnDefs}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  pagination
                  paginationPageSize={10}
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
                  pagination
                  paginationPageSize={10}
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