import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"
import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community"
import {
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCcw,
  Table2,
  X,
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
  type SurveyResponseSummary,
  type SurveySectionStatistics,
} from "@/api/surveystat"
import Preview, { type PreviewColumn, type PreviewSummaryItem } from "@/components/preview"

ModuleRegistry.registerModules([AllCommunityModule])

type DistributionDatum = {
  rating: string
  count: number
}

type StatisticsPreviewRow = {
  sectionTitle: string
  itemCode: string
  itemStatement: string
  count: number
  weightedMean: number
  standardDeviation: number
  interpretation: string
  meanRange: string
}

type CalculationStep = {
  label: string
  formula: string
  substitution: string
  result: string
}

type LikertDistribution = Record<LikertValue, number>

type SectionSolution = {
  answerCount: number
  weightedTotal: number
  distribution: LikertDistribution
  hasFrequencyDistribution: boolean
  steps: CalculationStep[]
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

const cartesianPlotlyConfig: Record<string, unknown> = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToAdd: ["zoomOut2d", "resetScale2d"],
  modeBarButtonsToRemove: ["select2d", "lasso2d"],
}

const piePlotlyConfig: Record<string, unknown> = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
}

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

function getRespondentKey(response: SurveyResponseSummary) {
  return response.respondentId?.trim() || `anonymous-${response.id}`
}

function getOverallResultNarrative(
  summary: StatisticsSummary,
  selectedFormTitle: string,
  responseCount: number,
  respondentCount: number,
) {
  if (summary.answerCount === 0) {
    return "No submitted answers are available yet for this survey, so the overall result cannot be interpreted."
  }

  return `${selectedFormTitle} received ${responseCount} total response${responseCount === 1 ? "" : "s"} from ${respondentCount} respondent${respondentCount === 1 ? "" : "s"}. The overall weighted mean is ${formatNumber(summary.weightedMean)}, which falls within ${summary.meanRange} and is interpreted as ${summary.interpretation}.`
}

function getSectionResultNarrative(section: SurveySectionStatistics) {
  if (section.count === 0) {
    return `${section.sectionTitle} has no submitted answers yet, so its section mean cannot be interpreted.`
  }

  return `${section.sectionTitle} has a section mean of ${formatNumber(section.weightedMean)} based on ${section.count} answer${section.count === 1 ? "" : "s"}, interpreted as ${section.interpretation} (${section.meanRange}).`
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

function createEmptyLikertDistribution(): LikertDistribution {
  return {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  }
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function getLikertDistribution(value: unknown): LikertDistribution {
  const distribution = createEmptyLikertDistribution()
  const record = getRecord(value)
  const source = getRecord(record?.distribution)

  if (!source) {
    return distribution
  }

  ;([1, 2, 3, 4, 5] as LikertValue[]).forEach((rating) => {
    distribution[rating] = toNumber(source[rating] ?? source[String(rating)])
  })

  return distribution
}

function hasDistributionAnswers(distribution: LikertDistribution) {
  return ([1, 2, 3, 4, 5] as LikertValue[]).some((rating) => distribution[rating] > 0)
}

function combineItemDistributions(items: SurveyItemStatistics[]): LikertDistribution {
  return items.reduce((combined, item) => {
    const distribution = getLikertDistribution(item)

    ;([1, 2, 3, 4, 5] as LikertValue[]).forEach((rating) => {
      combined[rating] += distribution[rating]
    })

    return combined
  }, createEmptyLikertDistribution())
}

function getCalculationSteps(value: unknown): CalculationStep[] {
  const record = getRecord(value)
  const calculation = getRecord(record?.calculation)
  const steps = Array.isArray(calculation?.steps) ? calculation.steps : []

  return steps
    .map((step) => {
      const stepRecord = getRecord(step)

      if (!stepRecord) {
        return null
      }

      return {
        label: String(stepRecord.label ?? "Step"),
        formula: String(stepRecord.formula ?? ""),
        substitution: String(stepRecord.substitution ?? ""),
        result: String(stepRecord.result ?? ""),
      }
    })
    .filter((step): step is CalculationStep => Boolean(step))
}

function normalizeStatisticsText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function getItemOrderValue(item: SurveyItemStatistics) {
  const itemRecord = getRecord(item)
  const explicitOrder = toNumber(itemRecord?.order ?? itemRecord?.sortOrder ?? itemRecord?.itemOrder, Number.NaN)

  if (Number.isFinite(explicitOrder)) {
    return explicitOrder
  }

  const itemCode = String(item.itemCode ?? "")
  const numericCode = Number(itemCode.match(/\d+/)?.[0] ?? Number.NaN)

  return Number.isFinite(numericCode) ? numericCode : Number.MAX_SAFE_INTEGER
}

function getSectionItemStatistics(section: SurveySectionStatistics, items: SurveyItemStatistics[]) {
  const sectionRecord = getRecord(section)
  const sectionId = String(sectionRecord?.sectionId ?? "").trim()
  const sectionTitle = normalizeStatisticsText(section.sectionTitle)

  return items
    .filter((item) => {
      const itemRecord = getRecord(item)
      const itemSectionId = String(itemRecord?.sectionId ?? "").trim()

      if (sectionId && itemSectionId) {
        return itemSectionId === sectionId
      }

      return normalizeStatisticsText(item.sectionTitle) === sectionTitle
    })
    .sort((firstItem, secondItem) => {
      const orderDifference = getItemOrderValue(firstItem) - getItemOrderValue(secondItem)

      if (orderDifference !== 0) {
        return orderDifference
      }

      return String(firstItem.itemCode ?? "").localeCompare(String(secondItem.itemCode ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })
}

function createSectionCalculation(section: SurveySectionStatistics, items: SurveyItemStatistics[]): SectionSolution {
  const sectionDistribution = getLikertDistribution(section)
  const itemDistribution = combineItemDistributions(items)
  const distribution = hasDistributionAnswers(sectionDistribution) ? sectionDistribution : itemDistribution
  const hasFrequencyDistribution = hasDistributionAnswers(distribution)
  const answerCount = section.count || ([1, 2, 3, 4, 5] as LikertValue[]).reduce(
    (total, rating) => total + distribution[rating],
    0,
  )
  const weightedTotal = hasFrequencyDistribution
    ? ([1, 2, 3, 4, 5] as LikertValue[]).reduce((total, rating) => total + rating * distribution[rating], 0)
    : section.weightedMean * answerCount
  const calculatedWeightedMean = answerCount > 0 ? weightedTotal / answerCount : 0
  const fallbackSteps: CalculationStep[] = [
    {
      label: "Frequency count",
      formula: "f = count of submitted answers per Likert rating",
      substitution: hasFrequencyDistribution
        ? `1=${distribution[1]}, 2=${distribution[2]}, 3=${distribution[3]}, 4=${distribution[4]}, 5=${distribution[5]}`
        : `N=${answerCount} section answers`,
      result: `${answerCount} total section answers`,
    },
    {
      label: "Weighted total",
      formula: "Σ(xf)",
      substitution: hasFrequencyDistribution
        ? `1(${distribution[1]}) + 2(${distribution[2]}) + 3(${distribution[3]}) + 4(${distribution[4]}) + 5(${distribution[5]})`
        : `${formatNumber(section.weightedMean)} × ${answerCount}`,
      result: formatNumber(weightedTotal),
    },
    {
      label: "Weighted mean",
      formula: "Σ(xf) / N",
      substitution: `${formatNumber(weightedTotal)} / ${answerCount || 1}`,
      result: formatNumber(hasFrequencyDistribution ? calculatedWeightedMean : section.weightedMean),
    },
    {
      label: "Standard deviation",
      formula: "√variance",
      substitution: `SD=${formatNumber(section.standardDeviation)}`,
      result: formatNumber(section.standardDeviation),
    },
    {
      label: "Interpretation",
      formula: "Weighted mean matched to the Likert mean range",
      substitution: `${formatNumber(section.weightedMean)} belongs to ${section.meanRange}`,
      result: section.interpretation,
    },
  ]
  const sectionSteps = getCalculationSteps(section)

  return {
    answerCount,
    weightedTotal,
    distribution,
    hasFrequencyDistribution,
    steps: sectionSteps.length > 0 ? sectionSteps : fallbackSteps,
  }
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
      <div className="flex h-80 items-center justify-center rounded-2xl bg-slate-50 sm:h-96">
        <Loader2 className="size-8 animate-spin text-cyan-600" />
      </div>
    )
  }

  return <PlotComponent {...props} />
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-80 items-center justify-center rounded-2xl bg-slate-50 p-6 text-center sm:h-96">
      <p className="max-w-sm text-sm font-semibold leading-6 text-slate-500 wrap-anywhere">{message}</p>
    </div>
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

export function Statistic() {
  const [forms, setForms] = useState<SurveyForm[]>([])
  const [selectedFormCode, setSelectedFormCode] = useState("")
  const [summary, setSummary] = useState<StatisticsSummary>(defaultSummary)
  const [formStatistics, setFormStatistics] = useState<SurveyFormStatistics[]>([])
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseSummary[]>([])
  const [sectionStatistics, setSectionStatistics] = useState<SurveySectionStatistics[]>([])
  const [itemStatistics, setItemStatistics] = useState<SurveyItemStatistics[]>([])
  const [isFormsLoading, setIsFormsLoading] = useState(true)
  const [isComputing, setIsComputing] = useState(false)
  const [hasComputed, setHasComputed] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [selectedSection, setSelectedSection] = useState<SurveySectionStatistics | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const distributionData = useMemo(() => toDistributionData(summary.distribution), [summary.distribution])
  const formChartLabels = useMemo(() => formStatistics.map((item) => item.formTitle), [formStatistics])
  const formChartMeans = useMemo(() => formStatistics.map((item) => item.weightedMean), [formStatistics])
  const selectedFormTitle = useMemo(() => getSelectedFormTitle(forms, selectedFormCode), [forms, selectedFormCode])
  const totalResponseCount = Math.max(summary.responseCount, surveyResponses.length)
  const respondentCount = new Set(surveyResponses.map(getRespondentKey)).size
  const totalRespondentCount = respondentCount || totalResponseCount
  const overallResultNarrative = getOverallResultNarrative(
    summary,
    selectedFormTitle,
    totalResponseCount,
    totalRespondentCount,
  )
  const sectionResultNarratives = useMemo(
    () => sectionStatistics.map((section) => getSectionResultNarrative(section)),
    [sectionStatistics],
  )
  const calculationSteps = summary.calculation?.steps ?? createFallbackCalculation(summary)
  const selectedSectionItems = useMemo(
    () => (selectedSection ? getSectionItemStatistics(selectedSection, itemStatistics) : []),
    [itemStatistics, selectedSection],
  )
  const selectedSectionSolution = useMemo(
    () => (selectedSection ? createSectionCalculation(selectedSection, selectedSectionItems) : null),
    [selectedSection, selectedSectionItems],
  )

  const statisticsPreviewColumns = useMemo<PreviewColumn<StatisticsPreviewRow>[]>(
    () => [
      { key: "sectionTitle", header: "Section" },
      { key: "itemCode", header: "Code" },
      { key: "itemStatement", header: "Checklist Item" },
      { key: "count", header: "Answers" },
      { key: "weightedMean", header: "Weighted Mean" },
      { key: "standardDeviation", header: "Std. Dev." },
      { key: "interpretation", header: "Interpretation" },
      { key: "meanRange", header: "Mean Range" },
    ],
    [],
  )

  const statisticsPreviewSummary = useMemo<PreviewSummaryItem[]>(
    () => [
      { label: "Survey", value: selectedFormTitle },
      { label: "Responses", value: totalResponseCount },
      { label: "Respondents", value: totalRespondentCount },
      { label: "Answer Count", value: summary.answerCount },
      { label: "Weighted Mean", value: formatNumber(summary.weightedMean) },
      { label: "Standard Deviation", value: formatNumber(summary.standardDeviation) },
      { label: "Variance", value: formatNumber(summary.variance) },
      { label: "Interpretation", value: summary.interpretation },
      { label: "Mean Range", value: summary.meanRange },
    ],
    [selectedFormTitle, summary, totalRespondentCount, totalResponseCount],
  )

  const calculationPreviewRows = useMemo<StatisticsPreviewRow[]>(
    () =>
      calculationSteps.map((step, index) => ({
        sectionTitle: "Detailed Solution",
        itemCode: `Step ${index + 1}`,
        itemStatement: `${step.label} · ${step.formula} · ${step.substitution}`,
        count: summary.answerCount,
        weightedMean: summary.weightedMean,
        standardDeviation: summary.standardDeviation,
        interpretation: step.result,
        meanRange: summary.meanRange,
      })),
    [calculationSteps, summary],
  )

  const statisticsPreviewRows = useMemo<StatisticsPreviewRow[]>(
    () => {
      const sectionRows = sectionStatistics.map((section) => ({
        sectionTitle: section.sectionTitle,
        itemCode: "Section Mean",
        itemStatement: getSectionResultNarrative(section),
        count: section.count,
        weightedMean: section.weightedMean,
        standardDeviation: section.standardDeviation,
        interpretation: section.interpretation,
        meanRange: section.meanRange,
      }))

      const itemRows = itemStatistics.map((item) => ({
        sectionTitle: item.sectionTitle,
        itemCode: item.itemCode,
        itemStatement: item.itemStatement,
        count: item.count,
        weightedMean: item.weightedMean,
        standardDeviation: item.standardDeviation,
        interpretation: item.interpretation,
        meanRange: item.meanRange,
      }))

      return sectionRows.length > 0 || itemRows.length > 0 ? [...sectionRows, ...itemRows] : calculationPreviewRows
    },
    [calculationPreviewRows, itemStatistics, sectionStatistics],
  )

  const sectionColumnDefs = useMemo<ColDef<SurveySectionStatistics>[]>(
    () => [
      { field: "formTitle", headerName: "Form", minWidth: 200, flex: 1 },
      { field: "sectionTitle", headerName: "Section", minWidth: 240, flex: 1 },
      { field: "count", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "standardDeviation", headerName: "Std. Dev.", width: 130 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 170, flex: 1 },
      { field: "meanRange", headerName: "Mean Range", width: 140 },
    ],
    [],
  )

  const itemColumnDefs = useMemo<ColDef<SurveyItemStatistics>[]>(
    () => [
      { field: "formTitle", headerName: "Form", minWidth: 200, flex: 1 },
      { field: "sectionTitle", headerName: "Section", minWidth: 200, flex: 1 },
      { field: "itemCode", headerName: "Code", width: 120 },
      { field: "itemStatement", headerName: "Item Statement", minWidth: 320, flex: 2 },
      { field: "count", headerName: "Answers", width: 120 },
      { field: "weightedMean", headerName: "Weighted Mean", width: 160 },
      { field: "standardDeviation", headerName: "Std. Dev.", width: 130 },
      { field: "interpretation", headerName: "Interpretation", minWidth: 170, flex: 1 },
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
      setSelectedSection(null)
      const nextFilters = getFormFilterValue(formCode)
      const [summaryData, formData, sectionData, itemData, responseData] = await Promise.all([
        surveyStatService.getStatisticsSummary(nextFilters),
        surveyStatService.getFormStatistics(nextFilters),
        surveyStatService.getSectionStatistics(nextFilters),
        surveyStatService.getItemStatistics(nextFilters),
        surveyStatService.listSurveyResponses({
          formCode,
          submittedOnly: true,
          limit: 1000,
        }),
      ])

      setSummary(summaryData)
      setFormStatistics(formData)
      setSectionStatistics(sectionData)
      setItemStatistics(itemData)
      setSurveyResponses(responseData)
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
    setSurveyResponses([])
    setSectionStatistics([])
    setItemStatistics([])
    setSelectedSection(null)
  }

  useEffect(() => {
    loadForms()
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
                  <BarChart3 className="size-5 sm:size-6" />
                </span>
                <div className="min-w-0">
                  <h1 className="wrap-break-word text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">Survey Statistics</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 wrap-anywhere">
                    Select one survey first, then compute descriptive statistics with a detailed weighted-mean solution.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 lg:flex lg:flex-col xl:flex-row">
              <button
                type="button"
                disabled={!selectedFormCode || isComputing}
                onClick={() => loadStatistics(selectedFormCode)}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:px-5"
              >
                {isComputing ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4 shrink-0" />}
                <span className="truncate">Compute Selected Survey</span>
              </button>
              <button
                type="button"
                disabled={!hasComputed || isComputing}
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 sm:px-5"
              >
                <Eye className="size-4 shrink-0" />
                <span className="truncate">Preview Result</span>
              </button>
              <button
                type="button"
                onClick={() => (hasComputed ? loadStatistics(selectedFormCode) : loadForms())}
                className="inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 sm:col-span-2 sm:px-5 xl:col-span-1"
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
              <h2 className="wrap-break-word text-lg font-black sm:text-xl">Choose Survey to Compute</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 wrap-anywhere">
                Statistics are computed only after selecting a specific survey form.
              </p>
            </div>
            <span className="max-w-full rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600 wrap-anywhere sm:max-w-sm">
              {selectedFormCode ? selectedFormTitle : "No survey selected"}
            </span>
          </div>

          {isFormsLoading ? (
            <div className="flex min-h-40 items-center justify-center rounded-2xl bg-slate-50">
              <Loader2 className="size-8 animate-spin text-cyan-600" />
            </div>
          ) : (
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {forms.map((form) => {
                const isSelected = selectedFormCode === form.code

                return (
                  <button
                    key={form.id}
                    type="button"
                    onClick={() => selectSurvey(form.code)}
                    className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/50"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="size-5" /> : form.surveyStepNumber ?? 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black uppercase tracking-wide text-cyan-700 wrap-anywhere">
                          {form.code}
                        </span>
                        <span className="mt-1 line-clamp-2 block font-black text-slate-950 wrap-anywhere">{form.title}</span>
                        <span className="mt-2 line-clamp-3 block text-sm leading-6 text-slate-500 wrap-anywhere">{form.description}</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {!hasComputed ? (
          <section className="rounded-2xl bg-white p-5 text-center shadow-sm sm:rounded-3xl sm:p-8">
            <Calculator className="mx-auto size-12 text-slate-300" />
            <h2 className="mt-4 text-xl font-black sm:text-2xl">No computed result yet</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500 wrap-anywhere">
              Select a survey card above and click Compute Selected Survey to show the rating distribution, weighted mean,
              interpretation, and detailed solution.
            </p>
          </section>
        ) : isComputing ? (
          <div className="flex min-h-96 items-center justify-center rounded-2xl bg-white shadow-sm sm:rounded-3xl">
            <Loader2 className="size-8 animate-spin text-cyan-600" />
          </div>
        ) : (
          <div className="min-w-0 space-y-6">
            <MethodReferenceCard />

            <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Responses" value={totalResponseCount} />
              <SummaryCard label="Respondents" value={totalRespondentCount} />
              <SummaryCard label="Answer Count" value={summary.answerCount} />
              <SummaryCard label="Weighted Mean" value={summary.weightedMean.toFixed(2)} />
              <SummaryCard label="Interpretation" value={summary.interpretation} />
            </section>

            <ResultNarrativeCard
              overallNarrative={overallResultNarrative}
              sectionNarratives={sectionResultNarratives}
            />

            <SectionMeanSummary sections={sectionStatistics} onSectionClick={setSelectedSection} />

            <section className="grid min-w-0 gap-6 xl:grid-cols-2">
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
                    margin: { l: 42, r: 12, t: 50, b: 50 },
                  }}
                  config={cartesianPlotlyConfig}
                  useResizeHandler
                  className="h-80 w-full sm:h-96"
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
                    margin: { l: 12, r: 12, t: 50, b: 20 },
                    showlegend: true,
                  }}
                  config={piePlotlyConfig}
                  useResizeHandler
                  className="h-80 w-full sm:h-96"
                  style={{ width: "100%", height: "100%" }}
                />
              </ChartCard>
            </section>

            <CalculationSolution title={`Detailed Solution · ${selectedFormTitle}`}>
              <div className="grid min-w-0 gap-3">
                {calculationSteps.map((step, index) => (
                  <div key={`${step.label}-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black uppercase tracking-wide text-cyan-700 wrap-anywhere">
                      Step {index + 1}: {step.label}
                    </p>
                    <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
                      <SolutionBlock label="Formula" value={step.formula} />
                      <SolutionBlock label="Substitution" value={step.substitution} />
                      <SolutionBlock label="Result" value={step.result} />
                    </div>
                  </div>
                ))}
              </div>
            </CalculationSolution>

            <GridCard title="Section Statistics" rows={sectionStatistics.length}>
              <GridViewport>
                <div className="ag-theme-quartz h-96 w-full min-w-0">
                  <AgGridReact
                    rowData={sectionStatistics}
                    columnDefs={sectionColumnDefs}
                    defaultColDef={{ sortable: true, filter: true, resizable: true }}
                    theme="legacy"
                    pagination
                    paginationPageSize={10}
                    paginationPageSizeSelector={false}
                    animateRows
                  />
                </div>
              </GridViewport>
            </GridCard>

            <GridCard title="Item Statistics" rows={itemStatistics.length}>
              <GridViewport>
                <div className="ag-theme-quartz h-96 w-full min-w-0">
                  <AgGridReact
                    rowData={itemStatistics}
                    columnDefs={itemColumnDefs}
                    defaultColDef={{ sortable: true, filter: true, resizable: true }}
                    theme="legacy"
                    pagination
                    paginationPageSize={10}
                    paginationPageSizeSelector={false}
                    animateRows
                  />
                </div>
              </GridViewport>
            </GridCard>
          </div>
        )}
      </div>

      <Preview
        isOpen={isPreviewOpen}
        title={`Statistics Preview · ${selectedFormTitle}`}
        subtitle="Detailed statistical solution, result, and item-level statistics"
        fileName={`${selectedFormCode || "statistics"}-survey-statistics`}
        summary={statisticsPreviewSummary}
        rows={statisticsPreviewRows}
        columns={statisticsPreviewColumns}
        isLoading={isComputing}
        onClose={() => setIsPreviewOpen(false)}
      >
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-black uppercase tracking-wide text-slate-500">Result Narrative</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700 wrap-anywhere">{overallResultNarrative}</p>
          {sectionResultNarratives.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {sectionResultNarratives.map((narrative) => (
                <p key={narrative} className="rounded-xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600 wrap-anywhere">
                  {narrative}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
          <p className="text-sm font-black uppercase tracking-wide text-cyan-700">Detailed Solution</p>
          <div className="mt-3 grid gap-3">
            {calculationSteps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="rounded-xl bg-white p-3">
                <p className="text-sm font-black text-slate-950 wrap-anywhere">Step {index + 1}: {step.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600 wrap-anywhere">
                  <span className="font-bold">Formula:</span> {step.formula}
                </p>
                <p className="text-sm leading-6 text-slate-600 wrap-anywhere">
                  <span className="font-bold">Substitution:</span> {step.substitution}
                </p>
                <p className="text-sm leading-6 text-slate-600 wrap-anywhere">
                  <span className="font-bold">Result:</span> {step.result}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Preview>

      <SectionSolutionDialog
        section={selectedSection}
        items={selectedSectionItems}
        solution={selectedSectionSolution}
        onClose={() => setSelectedSection(null)}
      />
    </main>
  )
}

type ResultNarrativeCardProps = {
  overallNarrative: string
  sectionNarratives: string[]
}

function ResultNarrativeCard({ overallNarrative, sectionNarratives }: ResultNarrativeCardProps) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <BookOpenCheck className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="wrap-break-word text-lg font-black sm:text-xl">Result Narrative</h2>
          <p className="mt-2 text-sm font-semibold leading-7 text-slate-700 wrap-anywhere">{overallNarrative}</p>
          {sectionNarratives.length > 0 ? (
            <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
              {sectionNarratives.map((narrative) => (
                <div key={narrative} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold leading-6 text-slate-600 wrap-anywhere">{narrative}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

type SectionMeanSummaryProps = {
  sections: SurveySectionStatistics[]
  onSectionClick: (section: SurveySectionStatistics) => void
}

function SectionMeanSummary({ sections, onSectionClick }: SectionMeanSummaryProps) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <Calculator className="size-5" />
        </span>
        <h2 className="wrap-break-word text-lg font-black sm:text-xl">Mean of Every Section</h2>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          No section-level results are available for this survey yet.
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <button
              key={section.sectionId}
              type="button"
              aria-label={`View detailed solution for ${section.sectionTitle}`}
              onClick={() => onSectionClick(section)}
              className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
            >
              <p className="line-clamp-2 text-sm font-black text-slate-950 wrap-anywhere">{section.sectionTitle}</p>
              <p className="mt-3 text-2xl font-black tracking-tight text-cyan-700 sm:text-3xl">
                {formatNumber(section.weightedMean)}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-600 wrap-anywhere">{section.interpretation}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400 wrap-anywhere">
                {section.count} answers · {section.meanRange}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

type SectionSolutionDialogProps = {
  section: SurveySectionStatistics | null
  items: SurveyItemStatistics[]
  solution: SectionSolution | null
  onClose: () => void
}

function SectionSolutionDialog({ section, items, solution, onClose }: SectionSolutionDialogProps) {
  useEffect(() => {
    if (!section) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [section, onClose])

  if (!section || !solution) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close section solution dialog"
        className="absolute inset-0 bg-slate-950/70"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-solution-title"
        className="relative z-10 flex max-h-[calc(100svh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100svh-2rem)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:gap-4 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700 sm:text-sm">Section Detailed Solution</p>
            <h2 id="section-solution-title" className="mt-1 wrap-break-word text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              {section.sectionTitle}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-8 sm:p-6 sm:pb-8">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Answers" value={solution.answerCount} />
            <SummaryCard label="Weighted Mean" value={formatNumber(section.weightedMean)} />
            <SummaryCard label="Std. Dev." value={formatNumber(section.standardDeviation)} />
            <SummaryCard label="Interpretation" value={section.interpretation} />
          </div>

          {solution.hasFrequencyDistribution ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black uppercase tracking-wide text-slate-500">Rating Frequency</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {([1, 2, 3, 4, 5] as LikertValue[]).map((rating) => (
                  <div key={rating} className="rounded-xl bg-white p-3 text-center">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Rating {rating}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{solution.distribution[rating]}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid min-w-0 gap-3">
            {solution.steps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black uppercase tracking-wide text-cyan-700 wrap-anywhere">
                  Step {index + 1}: {step.label}
                </p>
                <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-3">
                  <SolutionBlock label="Formula" value={step.formula} />
                  <SolutionBlock label="Substitution" value={step.substitution} />
                  <SolutionBlock label="Result" value={step.result} />
                </div>
              </div>
            ))}
          </div>

          {items.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-black uppercase tracking-wide text-slate-500">Section Items</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-white text-xs font-black uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Checklist Item</th>
                      <th className="px-4 py-3">Answers</th>
                      <th className="px-4 py-3">Weighted Mean</th>
                      <th className="px-4 py-3">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {items.map((item) => (
                      <tr key={`${item.sectionTitle}-${item.itemCode}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-black text-slate-950">{item.itemCode}</td>
                        <td className="min-w-80 px-4 py-3 font-semibold leading-6">{item.itemStatement}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">{item.count}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatNumber(item.weightedMean)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">{item.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function MethodReferenceCard() {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <BookOpenCheck className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="wrap-break-word text-lg font-black sm:text-xl">Statistical and Survey Reference</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600 wrap-anywhere">
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
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-950 wrap-break-word sm:text-3xl">{value}</p>
    </div>
  )
}

type ChartCardProps = {
  title: string
  children: ReactNode
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <h2 className="wrap-break-word text-lg font-black sm:text-xl">{title}</h2>
      <div className="mt-4 min-w-0 overflow-hidden">{children}</div>
    </section>
  )
}

type CalculationSolutionProps = {
  title: string
  children: ReactNode
}

function CalculationSolution({ title, children }: CalculationSolutionProps) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
          <Calculator className="size-5" />
        </span>
        <h2 className="min-w-0 wrap-break-word text-lg font-black sm:text-xl">{title}</h2>
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
    <div className="min-w-0 rounded-xl bg-white p-3">
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
    <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
            <Table2 className="size-5" />
          </span>
          <h2 className="min-w-0 wrap-break-word text-lg font-black sm:text-xl">{title}</h2>
        </div>
        <span className="inline-flex w-full justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600 sm:w-auto">{rows} rows</span>
      </div>
      {children}
    </section>
  )
}

export default Statistic