import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileText,
  FilePlus2,
  Layers3,
  Link2,
  Loader2,
  ListChecks,
  Menu,
  Plus,
  ShieldCheck,
  Upload,
  UsersRound,
  Wand2,
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
    title: "Chapter IV Data Gathering",
    icon: ClipboardCheck,
  },
  {
    title: "Document-to-Survey Reader",
    icon: FileText,
  },
  {
    title: "Mean and Statistics Results",
    icon: BarChart3,
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
      title: "Chapter IV Survey Items",
      sortOrder: 1,
      items: [
        {
          code: `survey_${stepNumber}_item_1`,
          statement: "Replace this sample checklist item with the actual Chapter IV survey indicator.",
          sortOrder: 1,
          isRequired: true,
        },
      ],
    },
  ]
}


type GeneratedSurveySections = NonNullable<CreateSurveyFormPayload["sections"]>

type GeneratedSurveyDraft = {
  fileName: string
  title: string
  description: string
  sections: GeneratedSurveySections
  sectionCount: number
  itemCount: number
}

type ZipEntry = {
  name: string
  compressionMethod: number
  compressedSize: number
  localHeaderOffset: number
}

type DecompressionStreamConstructor = new (format: string) => TransformStream<Uint8Array, Uint8Array>

function createArrayBufferBlobPart(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const maximumGeneratedSections = 6
const maximumGeneratedItemsPerSection = 10
const maximumGeneratedItems = 50

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
}

function normalizeDocumentText(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function normalizeDocumentLine(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[•*\-–—]+\s*/g, "")
    .replace(/^(?:\d+|[ivxlcdm]+)[.)]\s+/i, "")
    .trim()
}

function hasUsefulLetters(value: string) {
  return /[a-z]/i.test(value)
}

function isLikelySectionHeading(value: string) {
  const line = normalizeDocumentLine(value)
  const wordCount = line.split(/\s+/).filter(Boolean).length

  if (!line || line.length > 90 || line.endsWith(".") || line.endsWith("?") || wordCount > 10) {
    return false
  }

  return (
    /^(chapter|part|section|area|domain|dimension|factor|category|construct|variable|indicator|objective)\b/i.test(line) ||
    (/^[A-Z0-9\s:,&/()-]+$/.test(line) && /[A-Z]/.test(line) && wordCount >= 2)
  )
}

function isLikelySurveyStatement(value: string) {
  const line = normalizeDocumentLine(value)

  if (line.length < 18 || line.length > 260 || !hasUsefulLetters(line)) {
    return false
  }

  if (/^(figure|table|page|references|appendix|copyright|abstract|acknowledg(e)?ment)s?\b/i.test(line)) {
    return false
  }

  return true
}

function getReadableDocumentTitle(fileName: string, text: string) {
  const firstUsefulLine = text
    .split("\n")
    .map(normalizeDocumentLine)
    .find((line) => line.length >= 8 && line.length <= 90 && hasUsefulLetters(line))

  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
  return firstUsefulLine || baseName || "Chapter IV Research Survey"
}

function createDocumentSurveyDescription(fileName: string) {
  return `Survey generated from ${fileName} for Chapter IV data gathering and statistical analysis.`
}

function createGeneratedSectionCode(title: string, index: number) {
  return createCodeFromTitle(title, `section_${index + 1}`)
}

function createGeneratedItemCode(sectionCode: string, index: number) {
  return `${sectionCode}_item_${index + 1}`.slice(0, 60)
}

function createFallbackGeneratedSections(): GeneratedSurveySections {
  const items = [
    "The research instrument clearly supports Chapter IV data gathering.",
    "The survey indicators are understandable for the intended respondents.",
    "The collected responses can be used to compute meaningful statistical results.",
    "The survey structure is appropriate for descriptive analysis and interpretation.",
  ]

  return [
    {
      code: "chapter_iv_research_items",
      title: "Chapter IV Research Items",
      sortOrder: 1,
      items: items.map((statement, index) => ({
        code: `chapter_iv_research_item_${index + 1}`,
        statement,
        sortOrder: index + 1,
        isRequired: true,
      })),
    },
  ]
}

function buildSurveySectionsFromText(text: string): GeneratedSurveySections {
  const lines = text
    .split("\n")
    .map(normalizeDocumentLine)
    .filter(Boolean)

  const sections: Array<{ title: string; items: string[] }> = []
  let currentSection: { title: string; items: string[] } = {
    title: "Survey Items",
    items: [],
  }
  const seenStatements = new Set<string>()

  function pushCurrentSection() {
    if (currentSection.items.length === 0) return

    sections.push(currentSection)
    currentSection = {
      title: "Survey Items",
      items: [],
    }
  }

  for (const line of lines) {
    if (sections.length >= maximumGeneratedSections && currentSection.items.length >= maximumGeneratedItemsPerSection) {
      break
    }

    if (isLikelySectionHeading(line)) {
      if (currentSection.items.length > 0) {
        pushCurrentSection()
      }

      if (sections.length < maximumGeneratedSections) {
        currentSection.title = line
      }

      continue
    }

    if (!isLikelySurveyStatement(line)) {
      continue
    }

    const normalizedStatementKey = line.toLowerCase()

    if (seenStatements.has(normalizedStatementKey)) {
      continue
    }

    seenStatements.add(normalizedStatementKey)
    currentSection.items.push(line)

    const totalItems = sections.reduce((total, section) => total + section.items.length, 0) + currentSection.items.length
    if (currentSection.items.length >= maximumGeneratedItemsPerSection || totalItems >= maximumGeneratedItems) {
      pushCurrentSection()
    }
  }

  pushCurrentSection()

  if (sections.length === 0) {
    const sentenceCandidates = text
      .split(/(?<=[.!?])\s+/)
      .map(normalizeDocumentLine)
      .filter(isLikelySurveyStatement)
      .slice(0, maximumGeneratedItems)

    if (sentenceCandidates.length > 0) {
      sections.push({
        title: "Survey Items",
        items: sentenceCandidates,
      })
    }
  }

  const generatedSections = sections.slice(0, maximumGeneratedSections).map((section, sectionIndex) => {
    const sectionCode = createGeneratedSectionCode(section.title, sectionIndex)

    return {
      code: sectionCode,
      title: section.title,
      sortOrder: sectionIndex + 1,
      items: section.items.slice(0, maximumGeneratedItemsPerSection).map((statement, itemIndex) => ({
        code: createGeneratedItemCode(sectionCode, itemIndex),
        statement,
        sortOrder: itemIndex + 1,
        isRequired: true,
      })),
    }
  })

  return generatedSections.length > 0 ? generatedSections : createFallbackGeneratedSections()
}

function decodePdfLiteralString(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, escaped: string) => {
      const map: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        "(": "(",
        ")": ")",
        "\\": "\\",
      }

      return map[escaped] ?? escaped
    })
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

function extractTextFromPdfBuffer(buffer: ArrayBuffer) {
  const raw = new TextDecoder("windows-1252").decode(buffer)
  const chunks: string[] = []

  for (const match of raw.matchAll(/\((?:\\.|[^\\)]){3,}\)\s*(?:Tj|'|"|TJ)?/g)) {
    const literal = match[0].replace(/\)\s*(?:Tj|'|"|TJ)?\s*$/, "")
    const text = decodePdfLiteralString(literal.slice(1))

    if (hasUsefulLetters(text)) {
      chunks.push(text)
    }
  }

  return normalizeDocumentText(chunks.join("\n"))
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return offset
    }
  }

  return -1
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(bytes)

  if (endOffset === -1) {
    return []
  }

  const entryCount = readUint16(bytes, endOffset + 10)
  let centralDirectoryOffset = readUint32(bytes, endOffset + 16)
  const textDecoder = new TextDecoder()
  const entries: ZipEntry[] = []

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, centralDirectoryOffset) !== 0x02014b50) {
      break
    }

    const compressionMethod = readUint16(bytes, centralDirectoryOffset + 10)
    const compressedSize = readUint32(bytes, centralDirectoryOffset + 20)
    const fileNameLength = readUint16(bytes, centralDirectoryOffset + 28)
    const extraLength = readUint16(bytes, centralDirectoryOffset + 30)
    const commentLength = readUint16(bytes, centralDirectoryOffset + 32)
    const localHeaderOffset = readUint32(bytes, centralDirectoryOffset + 42)
    const nameBytes = bytes.slice(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength)
    const name = textDecoder.decode(nameBytes)

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    })

    centralDirectoryOffset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

async function inflateRawZipData(data: Uint8Array) {
  const DecompressionStreamCtor = (globalThis as unknown as {
    DecompressionStream?: DecompressionStreamConstructor
  }).DecompressionStream

  if (!DecompressionStreamCtor) {
    throw new Error("Document decompression is not supported by this browser.")
  }

  const stream = new Blob([createArrayBufferBlobPart(data)]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry) {
  const localHeaderOffset = entry.localHeaderOffset

  if (readUint32(bytes, localHeaderOffset) !== 0x04034b50) {
    return new Uint8Array()
  }

  const fileNameLength = readUint16(bytes, localHeaderOffset + 26)
  const extraLength = readUint16(bytes, localHeaderOffset + 28)
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraLength
  const compressedData = bytes.slice(dataOffset, dataOffset + entry.compressedSize)

  if (entry.compressionMethod === 0) {
    return compressedData
  }

  if (entry.compressionMethod === 8) {
    return inflateRawZipData(compressedData)
  }

  throw new Error("Unsupported DOCX compression format.")
}

async function extractTextFromDocxBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const entries = readZipEntries(bytes)
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml")

  if (!documentEntry) {
    throw new Error("Unable to read the DOCX document content.")
  }

  const xmlBytes = await readZipEntry(bytes, documentEntry)
  const xml = new TextDecoder().decode(xmlBytes)
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []
  const lines = paragraphs
    .map((paragraph) =>
      Array.from(paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
        .map((match) => decodeXmlEntities(match[1]))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)

  return normalizeDocumentText(lines.join("\n"))
}

function extractTextFromLegacyDocBuffer(buffer: ArrayBuffer) {
  const raw = new TextDecoder("windows-1252").decode(buffer)
  const textRuns = raw.match(/[A-Za-z0-9][\x20-\x7E\s]{18,}/g) ?? []

  return normalizeDocumentText(textRuns.join("\n"))
}

async function extractSurveyDocumentText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""

  if (extension === "txt" || extension === "text" || file.type.startsWith("text/")) {
    return normalizeDocumentText(await file.text())
  }

  const buffer = await file.arrayBuffer()

  if (extension === "pdf" || file.type === "application/pdf") {
    return extractTextFromPdfBuffer(buffer)
  }

  if (extension === "docx" || file.type.includes("wordprocessingml.document")) {
    return extractTextFromDocxBuffer(buffer)
  }

  if (extension === "doc" || file.type.includes("msword")) {
    return extractTextFromLegacyDocBuffer(buffer)
  }

  throw new Error("Please upload a PDF, DOCX, DOC, or TXT document.")
}

async function createSurveyDraftFromDocument(file: File): Promise<GeneratedSurveyDraft> {
  const text = await extractSurveyDocumentText(file)

  if (!text || text.length < 20) {
    throw new Error("The uploaded document does not contain enough readable text to generate a survey.")
  }

  const sections = buildSurveySectionsFromText(text)
  const itemCount = sections.reduce((total, section) => total + section.items.length, 0)

  return {
    fileName: file.name,
    title: getReadableDocumentTitle(file.name, text),
    description: createDocumentSurveyDescription(file.name),
    sections,
    sectionCount: sections.length,
    itemCount,
  }
}

function cloneGeneratedSectionsForStep(
  sections: GeneratedSurveySections,
  stepNumber: number,
): GeneratedSurveySections {
  return sections.map((section, sectionIndex) => {
    const sectionCode = createCodeFromTitle(section.title, `document_section_${sectionIndex + 1}`)

    return {
      ...section,
      code: `${sectionCode}_${stepNumber}`,
      sortOrder: sectionIndex + 1,
      items: section.items.map((item, itemIndex) => ({
        ...item,
        code: `${sectionCode}_${stepNumber}_item_${itemIndex + 1}`.slice(0, 60),
        sortOrder: itemIndex + 1,
        isRequired: item.isRequired ?? true,
      })),
    }
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
  const [documentSurveyDraft, setDocumentSurveyDraft] = useState<GeneratedSurveyDraft | null>(null)
  const [isReadingSurveyDocument, setIsReadingSurveyDocument] = useState(false)
  const [documentReaderMessage, setDocumentReaderMessage] = useState("")
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
  const selectedExistingSurveyCodes = useMemo(
    () => selectedExistingSurveys.map((form) => form.code),
    [selectedExistingSurveys],
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
    const codes = selectedExistingSurveyCodes.length > 0 ? selectedExistingSurveyCodes : forms[0]?.code ? [forms[0].code] : []

    if (codes.length === 0) {
      toast.error("No active survey is available.")
      return
    }

    navigate(`/survey?forms=${encodeURIComponent(codes.join(","))}`)
  }


  async function handleSurveyDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) return

    setIsReadingSurveyDocument(true)
    setDocumentReaderMessage("Reading document and creating survey items...")

    try {
      const generatedDraft = await createSurveyDraftFromDocument(file)

      setDocumentSurveyDraft(generatedDraft)
      setCreateSurveyTitle((current) => current.trim() || generatedDraft.title)
      setCreateSurveyDescription((current) => current.trim() || generatedDraft.description)
      setDocumentReaderMessage(
        `${generatedDraft.itemCount} survey item${generatedDraft.itemCount === 1 ? "" : "s"} generated from ${generatedDraft.fileName}.`,
      )
      toast.success("Survey items were generated from the uploaded document.")
    } catch (error) {
      const message = getErrorMessage(error)
      setDocumentSurveyDraft(null)
      setDocumentReaderMessage(message)
      toast.error(message)
    } finally {
      setIsReadingSurveyDocument(false)
    }
  }

  function clearDocumentSurveyDraft() {
    setDocumentSurveyDraft(null)
    setDocumentReaderMessage("")
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

    const generatedSections = documentSurveyDraft?.sections?.length ? documentSurveyDraft.sections : null

    const formsToCreate = Array.from({ length: stepCount }, (_, index) => {
      const stepNumber = index + 1
      const stepTitle = createMode === "series" ? `${title} - Survey ${stepNumber}` : title

      return {
        code: `${baseCode}_${timestamp}_${stepNumber}`,
        title: stepTitle,
        description: createSurveyDescription.trim() || "Custom Chapter IV survey created by the researcher.",
        instruction: defaultSurveyInstruction,
        respondentInformationRequired,
        isActive: true,
        surveySeriesId: `${baseCode}_${timestamp}`,
        surveySeriesTitle: title,
        surveyStepNumber: stepNumber,
        sections: generatedSections ? cloneGeneratedSectionsForStep(generatedSections, stepNumber) : getDefaultSections(stepNumber),
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
      setDocumentSurveyDraft(null)
      setDocumentReaderMessage("")
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
              Chapter IV survey data gathering and statistics
            </div>

            <div className="space-y-6">
              <h1 className="max-w-full text-2xl font-black tracking-tight text-white wrap-anywhere sm:max-w-4xl sm:text-5xl md:text-7xl">
                Create Chapter IV survey instruments and compute statistical results faster.
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
                  <p className="text-sm text-slate-400">Research Survey Summary</p>
                  <h2 className="mt-1 line-clamp-2 max-w-full text-lg font-bold wrap-anywhere sm:max-w-none sm:text-2xl">{highlightedSurvey?.title ?? "Active Research Surveys"}</h2>
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
                  onClick={() => copySurveyShareLink(selectedExistingSurveyCodes)}
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
                placeholder="Describe the research purpose of the survey"
              />
            </label>

            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Wand2 className="size-5 shrink-0 text-cyan-200" />
                    <p className="wrap-break-word text-sm font-black text-cyan-50">PDF and document reader</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300 wrap-anywhere">
                    Upload a PDF, DOCX, DOC, or TXT file to automatically create survey sections and checklist items from the document text.
                  </p>
                </div>

                {documentSurveyDraft ? (
                  <button
                    type="button"
                    onClick={clearDocumentSurveyDraft}
                    className="inline-flex w-full shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-200 transition hover:bg-white/10 sm:w-auto"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <label className="mt-4 flex min-w-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-cyan-300/30 bg-slate-950/40 px-4 py-5 text-center transition hover:border-cyan-300/60 hover:bg-slate-950/70">
                {isReadingSurveyDocument ? (
                  <Loader2 className="size-6 animate-spin text-cyan-200" />
                ) : (
                  <Upload className="size-6 text-cyan-200" />
                )}
                <span className="wrap-break-word text-sm font-black text-white">
                  {isReadingSurveyDocument ? "Reading document..." : "Upload document to generate survey"}
                </span>
                <span className="text-xs font-semibold text-slate-400">Accepted files: PDF, DOCX, DOC, TXT</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.text,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleSurveyDocumentUpload}
                  disabled={isReadingSurveyDocument}
                  className="sr-only"
                />
              </label>

              {documentReaderMessage ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm font-semibold leading-6 text-slate-200 wrap-anywhere">
                  {documentReaderMessage}
                </div>
              ) : null}

              {documentSurveyDraft ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Source</p>
                    <p className="mt-1 line-clamp-2 text-sm font-bold text-white wrap-anywhere">{documentSurveyDraft.fileName}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sections</p>
                    <p className="mt-1 text-2xl font-black text-white">{documentSurveyDraft.sectionCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Items</p>
                    <p className="mt-1 text-2xl font-black text-white">{documentSurveyDraft.itemCount}</p>
                  </div>
                </div>
              ) : null}
            </div>

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