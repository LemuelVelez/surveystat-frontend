import type {
  StatisticsSummary,
  SurveyItemStatistics,
  SurveyResponseSummary,
  SurveySectionStatistics,
} from "@/api/surveystat"

export type WorkbookCell = string | number | null

export type WorkbookSheet = {
  name: string
  title: string
  columns: {
    header: string
    width?: number
    numFmt?: string
    align?: "left" | "center" | "right"
  }[]
  rows: WorkbookCell[][]
  notes?: string[]
}

export type StatisticsWorkbookInput = {
  formTitle: string
  formCode: string
  responseSourceLabel: string
  summary: StatisticsSummary
  sectionStatistics: SurveySectionStatistics[]
  itemStatistics: SurveyItemStatistics[]
  surveyResponses: SurveyResponseSummary[]
  totalResponseCount: number
  totalRespondentCount: number
  generatedAt: Date
  submittedFrom?: string
  submittedTo?: string
}

type LikertBand = {
  value: 1 | 2 | 3 | 4 | 5
  label: string
  minimum: number
  maximum: number
  meanRange: string
}

export const LIKERT_BANDS: LikertBand[] = [
  { value: 5, label: "Strongly Agree", minimum: 4.21, maximum: 5, meanRange: "4.21–5.00" },
  { value: 4, label: "Agree", minimum: 3.41, maximum: 4.2, meanRange: "3.41–4.20" },
  { value: 3, label: "Neutral", minimum: 2.61, maximum: 3.4, meanRange: "2.61–3.40" },
  { value: 2, label: "Disagree", minimum: 1.81, maximum: 2.6, meanRange: "1.81–2.60" },
  { value: 1, label: "Strongly Disagree", minimum: 1, maximum: 1.8, meanRange: "1.00–1.80" },
]

const DASH = "—"
const SCALE_NOTE = "Likert scale: 5 = Strongly Agree, 4 = Agree, 3 = Neutral, 2 = Disagree, 1 = Strongly Disagree."
const WEIGHTED_MEAN_NOTE = "Weighted Mean = Σfx / N. Values are rounded to 2 decimals for display only; intermediate values are not rounded."
const SD_NOTE = "SD (sample, n−1)."
const INTERPRETATION_NOTE = `Interpretation bands: ${LIKERT_BANDS.map((band) => `${band.meanRange} ${band.label}`).join("; ")}.`
const COMPUTED_NOTES = [SCALE_NOTE, WEIGHTED_MEAN_NOTE, SD_NOTE, INTERPRETATION_NOTE]

function displayNumber(value: number, count: number) {
  return count > 0 && Number.isFinite(value) ? value : DASH
}

function weightedTotal(item: Pick<SurveyItemStatistics, "distribution">) {
  return ([1, 2, 3, 4, 5] as const).reduce(
    (total, rating) => total + rating * (item.distribution[rating] ?? 0),
    0,
  )
}

function interpretationForMean(mean: number, count: number) {
  if (count <= 0 || !Number.isFinite(mean)) {
    return DASH
  }

  const band = LIKERT_BANDS.find(({ minimum, maximum }) => mean >= minimum && mean <= maximum)
  return band?.label ?? DASH
}

function meanRangeForMean(mean: number, count: number) {
  if (count <= 0 || !Number.isFinite(mean)) {
    return DASH
  }

  const band = LIKERT_BANDS.find(({ minimum, maximum }) => mean >= minimum && mean <= maximum)
  return band?.meanRange ?? DASH
}

function competitionRanks<T>(items: T[], getValue: (item: T) => number, getKey: (item: T) => string) {
  const sorted = [...items].sort((left, right) => getValue(right) - getValue(left))
  const ranks = new Map<string, number>()
  let previousValue: number | null = null
  let previousRank = 0

  sorted.forEach((item, index) => {
    const value = getValue(item)
    const rank = previousValue !== null && value === previousValue ? previousRank : index + 1
    ranks.set(getKey(item), rank)
    previousValue = value
    previousRank = rank
  })

  return ranks
}

function getSectionItems(section: SurveySectionStatistics, itemStatistics: SurveyItemStatistics[]) {
  const matchingItems = itemStatistics.filter((item) => item.sectionId === section.sectionId)
  return matchingItems.length > 0 ? matchingItems : section.items ?? []
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return DASH

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function buildCover(input: StatisticsWorkbookInput): WorkbookSheet {
  const dateRange = input.submittedFrom || input.submittedTo
    ? `${input.submittedFrom || "Beginning"} to ${input.submittedTo || "Latest"}`
    : "All submitted responses"

  const rows: WorkbookCell[][] = [
    ["Report", "Survey Statistical Tally & Descriptive Statistics"],
    ["Survey", input.formTitle],
    ["Form Code", input.formCode],
    ["Response Source", input.responseSourceLabel],
    ["Date Range", dateRange],
    ["Respondents", input.totalRespondentCount],
    ["Responses", input.totalResponseCount],
    ["Answers", input.summary.answerCount],
    ["Generated At", formatDate(input.generatedAt)],
    ["", ""],
    ["Likert Value", "Label / Mean Range"],
    ...LIKERT_BANDS.map((band) => [band.value, `${band.label} · ${band.meanRange}`]),
  ]

  return {
    name: "Cover",
    title: "SurveyStat Statistical Report",
    columns: [
      { header: "Report Detail", width: 22, align: "left" },
      { header: "Value", width: 48, align: "left" },
    ],
    rows,
    notes: [SCALE_NOTE, INTERPRETATION_NOTE],
  }
}

function buildTally(input: StatisticsWorkbookInput): WorkbookSheet {
  const itemRanks = competitionRanks(
    input.itemStatistics,
    (item) => item.weightedMean,
    (item) => item.itemId,
  )
  const rows: WorkbookCell[][] = []

  input.sectionStatistics.forEach((section) => {
    const items = getSectionItems(section, input.itemStatistics)

    items.forEach((item) => {
      const sumFx = weightedTotal(item)
      const weightedMean = item.count > 0 ? sumFx / item.count : Number.NaN
      rows.push([
        item.sectionTitle,
        item.itemCode,
        item.itemStatement,
        item.distribution[5] ?? 0,
        item.distribution[4] ?? 0,
        item.distribution[3] ?? 0,
        item.distribution[2] ?? 0,
        item.distribution[1] ?? 0,
        item.count,
        sumFx,
        displayNumber(weightedMean, item.count),
        displayNumber(item.standardDeviation, item.count),
        item.count > 0 ? itemRanks.get(item.itemId) ?? DASH : DASH,
        interpretationForMean(weightedMean, item.count),
      ])
    })

    const frequencies = ([1, 2, 3, 4, 5] as const).reduce<Record<1 | 2 | 3 | 4 | 5, number>>(
      (result, rating) => {
        result[rating] = items.reduce((total, item) => total + (item.distribution[rating] ?? 0), 0)
        return result
      },
      { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    )
    const sectionN = items.reduce((total, item) => total + item.count, 0)
    const sectionFx = ([1, 2, 3, 4, 5] as const).reduce(
      (total, rating) => total + rating * frequencies[rating],
      0,
    )
    const sectionMean = sectionN > 0 ? sectionFx / sectionN : Number.NaN

    rows.push([
      `Subtotal · ${section.sectionTitle}`,
      "",
      `${items.length} item${items.length === 1 ? "" : "s"}`,
      frequencies[5],
      frequencies[4],
      frequencies[3],
      frequencies[2],
      frequencies[1],
      sectionN,
      sectionFx,
      displayNumber(sectionMean, sectionN),
      displayNumber(section.standardDeviation, section.count),
      "",
      interpretationForMean(sectionMean, sectionN),
    ])
  })

  const grandFrequencies = ([1, 2, 3, 4, 5] as const).reduce<Record<1 | 2 | 3 | 4 | 5, number>>(
    (result, rating) => {
      result[rating] = input.itemStatistics.reduce((total, item) => total + (item.distribution[rating] ?? 0), 0)
      return result
    },
    { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  )
  const grandN = input.itemStatistics.reduce((total, item) => total + item.count, 0)
  const grandFx = ([1, 2, 3, 4, 5] as const).reduce(
    (total, rating) => total + rating * grandFrequencies[rating],
    0,
  )
  const grandMean = grandN > 0 ? grandFx / grandN : Number.NaN

  rows.push([
    "Grand Total / Overall",
    "",
    `${input.itemStatistics.length} item${input.itemStatistics.length === 1 ? "" : "s"}`,
    grandFrequencies[5],
    grandFrequencies[4],
    grandFrequencies[3],
    grandFrequencies[2],
    grandFrequencies[1],
    grandN,
    grandFx,
    displayNumber(grandMean, grandN),
    displayNumber(input.summary.standardDeviation, input.summary.count),
    "",
    interpretationForMean(grandMean, grandN),
  ])

  rows.push(["Percentage Distribution", "", "% of each item N", "", "", "", "", "", "", "", "", "", "", ""])

  input.itemStatistics.forEach((item) => {
    const percentage = (rating: 1 | 2 | 3 | 4 | 5) => item.count > 0
      ? ((item.distribution[rating] ?? 0) / item.count) * 100
      : DASH

    rows.push([
      item.sectionTitle,
      item.itemCode,
      item.itemStatement,
      percentage(5),
      percentage(4),
      percentage(3),
      percentage(2),
      percentage(1),
      item.count,
      weightedTotal(item),
      displayNumber(item.weightedMean, item.count),
      displayNumber(item.standardDeviation, item.count),
      item.count > 0 ? itemRanks.get(item.itemId) ?? DASH : DASH,
      interpretationForMean(item.weightedMean, item.count),
    ])
  })

  return {
    name: "Tally",
    title: `Frequency Distribution Tally · ${input.formTitle}`,
    columns: [
      { header: "Section", width: 24 },
      { header: "Item Code", width: 14, align: "center" },
      { header: "Item Statement", width: 52 },
      { header: "f(5) SA", width: 12, numFmt: "0", align: "right" },
      { header: "f(4) A", width: 12, numFmt: "0", align: "right" },
      { header: "f(3) N", width: 12, numFmt: "0", align: "right" },
      { header: "f(2) D", width: 12, numFmt: "0", align: "right" },
      { header: "f(1) SD", width: 12, numFmt: "0", align: "right" },
      { header: "Total (N)", width: 12, numFmt: "0", align: "right" },
      { header: "Σfx", width: 12, numFmt: "0", align: "right" },
      { header: "Weighted Mean", width: 16, numFmt: "0.00", align: "right" },
      { header: "SD", width: 12, numFmt: "0.00", align: "right" },
      { header: "Rank", width: 10, numFmt: "0", align: "center" },
      { header: "Verbal Interpretation", width: 24 },
    ],
    rows,
    notes: [...COMPUTED_NOTES, "Percentage-distribution block expresses f(x) as % of each item N."],
  }
}

function buildSectionSummary(input: StatisticsWorkbookInput): WorkbookSheet {
  const sectionRanks = competitionRanks(
    input.sectionStatistics,
    (section) => section.weightedMean,
    (section) => section.sectionId,
  )

  return {
    name: "Section Summary",
    title: `Section Summary · ${input.formTitle}`,
    columns: [
      { header: "Section", width: 30 },
      { header: "Items", width: 12, numFmt: "0", align: "right" },
      { header: "Answers (N)", width: 14, numFmt: "0", align: "right" },
      { header: "Weighted Mean", width: 16, numFmt: "0.00", align: "right" },
      { header: "SD", width: 12, numFmt: "0.00", align: "right" },
      { header: "Variance", width: 12, numFmt: "0.00", align: "right" },
      { header: "Mean Range", width: 14, align: "center" },
      { header: "Interpretation", width: 24 },
      { header: "Rank", width: 10, numFmt: "0", align: "center" },
    ],
    rows: input.sectionStatistics.map((section) => {
      const items = getSectionItems(section, input.itemStatistics)
      return [
        section.sectionTitle,
        items.length,
        section.count,
        displayNumber(section.weightedMean, section.count),
        displayNumber(section.standardDeviation, section.count),
        displayNumber(section.variance, section.count),
        meanRangeForMean(section.weightedMean, section.count),
        interpretationForMean(section.weightedMean, section.count),
        section.count > 0 ? sectionRanks.get(section.sectionId) ?? DASH : DASH,
      ]
    }),
    notes: COMPUTED_NOTES,
  }
}

function buildItemStatistics(input: StatisticsWorkbookInput): WorkbookSheet {
  return {
    name: "Item Statistics",
    title: `Item Descriptive Statistics · ${input.formTitle}`,
    columns: [
      { header: "Section", width: 26 },
      { header: "Item Code", width: 14, align: "center" },
      { header: "Item Statement", width: 52 },
      { header: "N", width: 10, numFmt: "0", align: "right" },
      { header: "Mean", width: 12, numFmt: "0.00", align: "right" },
      { header: "Weighted Mean", width: 16, numFmt: "0.00", align: "right" },
      { header: "SD", width: 12, numFmt: "0.00", align: "right" },
      { header: "Variance", width: 12, numFmt: "0.00", align: "right" },
      { header: "Min", width: 10, numFmt: "0", align: "right" },
      { header: "Max", width: 10, numFmt: "0", align: "right" },
      { header: "Σx", width: 12, numFmt: "0", align: "right" },
      { header: "Mean Range", width: 14, align: "center" },
      { header: "Interpretation", width: 24 },
    ],
    rows: input.itemStatistics.map((item) => [
      item.sectionTitle,
      item.itemCode,
      item.itemStatement,
      item.count,
      displayNumber(item.mean, item.count),
      displayNumber(item.weightedMean, item.count),
      displayNumber(item.standardDeviation, item.count),
      displayNumber(item.variance, item.count),
      displayNumber(item.minimum, item.count),
      displayNumber(item.maximum, item.count),
      item.count > 0 ? item.total : DASH,
      meanRangeForMean(item.weightedMean, item.count),
      interpretationForMean(item.weightedMean, item.count),
    ]),
    notes: COMPUTED_NOTES,
  }
}

function buildSolution(input: StatisticsWorkbookInput): WorkbookSheet {
  const rows: WorkbookCell[][] = []

  input.summary.calculation?.steps.forEach((step, index) => {
    rows.push(["Overall", index + 1, step.label, step.formula, step.substitution, step.result])
  })

  input.sectionStatistics.forEach((section) => {
    section.calculation?.steps.forEach((step, index) => {
      rows.push([section.sectionTitle, index + 1, step.label, step.formula, step.substitution, step.result])
    })
  })

  return {
    name: "Solution",
    title: `Statistical Solution · ${input.formTitle}`,
    columns: [
      { header: "Scope", width: 28 },
      { header: "Step", width: 10, numFmt: "0", align: "center" },
      { header: "Label", width: 26 },
      { header: "Formula", width: 30 },
      { header: "Substitution", width: 48 },
      { header: "Result", width: 28 },
    ],
    rows,
    notes: COMPUTED_NOTES,
  }
}

function buildResponseSource(input: StatisticsWorkbookInput): WorkbookSheet {
  const overall = input.summary.sourceBreakdown
  const rows: WorkbookCell[][] = [
    [
      "Overall",
      overall?.onlineResponseCount ?? 0,
      overall?.hardcopyResponseCount ?? 0,
      overall?.onlineAnswerCount ?? 0,
      overall?.hardcopyAnswerCount ?? 0,
    ],
    ...input.sectionStatistics.map((section) => [
      section.sectionTitle,
      section.sourceBreakdown?.onlineResponseCount ?? 0,
      section.sourceBreakdown?.hardcopyResponseCount ?? 0,
      section.sourceBreakdown?.onlineAnswerCount ?? 0,
      section.sourceBreakdown?.hardcopyAnswerCount ?? 0,
    ]),
  ]

  return {
    name: "Response Source",
    title: `Online vs Hardcopy Breakdown · ${input.formTitle}`,
    columns: [
      { header: "Scope", width: 30 },
      { header: "Online Responses", width: 18, numFmt: "0", align: "right" },
      { header: "Hardcopy Responses", width: 20, numFmt: "0", align: "right" },
      { header: "Online Answers", width: 18, numFmt: "0", align: "right" },
      { header: "Hardcopy Answers", width: 20, numFmt: "0", align: "right" },
    ],
    rows,
    notes: ["Response-source counts are taken from each statistics payload sourceBreakdown."],
  }
}

function buildRawResponses(input: StatisticsWorkbookInput): WorkbookSheet {
  return {
    name: "Raw Responses",
    title: `Raw Response Register · ${input.formTitle}`,
    columns: [
      { header: "Response ID", width: 36 },
      { header: "Submitted At", width: 22 },
      { header: "Respondent", width: 28 },
      { header: "Email", width: 30 },
      { header: "Role", width: 22 },
      { header: "Office", width: 24 },
      { header: "Program", width: 24 },
      { header: "Answers", width: 12, numFmt: "0", align: "right" },
      { header: "Weighted Mean", width: 16, numFmt: "0.00", align: "right" },
      { header: "Mean Range", width: 14, align: "center" },
      { header: "Interpretation", width: 24 },
    ],
    rows: input.surveyResponses.map((response) => [
      response.id,
      formatDate(response.submittedAt),
      response.respondentFullName || DASH,
      response.respondentEmail || DASH,
      response.respondentRole || DASH,
      response.respondentOffice || DASH,
      response.respondentProgram || DASH,
      response.answerCount,
      displayNumber(response.weightedMean, response.answerCount),
      meanRangeForMean(response.weightedMean, response.answerCount),
      interpretationForMean(response.weightedMean, response.answerCount),
    ]),
    notes: COMPUTED_NOTES,
  }
}

export function buildStatisticsWorkbook(input: StatisticsWorkbookInput): WorkbookSheet[] {
  const sheets = [
    buildCover(input),
    buildTally(input),
    buildSectionSummary(input),
    buildItemStatistics(input),
    buildSolution(input),
    buildResponseSource(input),
  ]

  if (input.surveyResponses.length > 0) {
    sheets.push(buildRawResponses(input))
  }

  return sheets
}
