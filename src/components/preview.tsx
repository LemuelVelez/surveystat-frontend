import { useState, type ReactNode } from "react"
import { Download, Maximize2, X } from "lucide-react"

export type PreviewColumn<T extends object> = {
  key: keyof T | string
  header: string
  getValue?: (row: T, index: number) => string | number | null | undefined
  getImageValue?: (row: T, index: number) => string | null | undefined
  renderValue?: (row: T, index: number) => ReactNode
}

export type PreviewSummaryItem = {
  label: string
  value: ReactNode
  exportValue?: string | number | null | undefined
  imageValue?: string | null | undefined
}

type PreviewProps<T extends object> = {
  isOpen: boolean
  title: string
  subtitle?: string
  fileName: string
  summary?: PreviewSummaryItem[]
  rows: T[]
  columns: PreviewColumn<T>[]
  isLoading?: boolean
  children?: ReactNode
  onClose: () => void
}

type ImageField = {
  label: string
  value: string
  imageSource?: string
  image?: HTMLImageElement | null
}

type ImageRecord = {
  title: string
  fields: ImageField[]
  height: number
}

const IMAGE_WIDTH = 1600
const IMAGE_MARGIN = 64
const IMAGE_CARD_RADIUS = 24
const IMAGE_LINE_HEIGHT = 28
const IMAGE_FONT = "Inter, Arial, sans-serif"
const IMAGE_BACKGROUND = "#f8fafc"
const IMAGE_TEXT = "#0f172a"
const IMAGE_MUTED = "#475569"
const IMAGE_BORDER = "#e2e8f0"
const IMAGE_HEADER = "#0f172a"
const IMAGE_ACCENT = "#0891b2"

function sanitizeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "surveystat-preview"
}

function getCellValue<T extends object>(row: T, column: PreviewColumn<T>, index: number) {
  if (column.getValue) {
    return column.getValue(row, index) ?? ""
  }

  const value = (row as Record<string, unknown>)[String(column.key)]
  return value === undefined || value === null ? "" : String(value)
}

function getRenderedCellValue<T extends object>(row: T, column: PreviewColumn<T>, index: number) {
  return column.renderValue?.(row, index) ?? getCellValue(row, column, index)
}

function getImageExportValue<T extends object>(row: T, column: PreviewColumn<T>, index: number) {
  return column.getImageValue?.(row, index) ?? ""
}

function getExportText(value: string | number | null | undefined) {
  if (value === undefined || value === null) {
    return "—"
  }

  const text = String(value).trim()
  return text || "—"
}

function getSummaryExportText(item: PreviewSummaryItem) {
  if (item.exportValue !== undefined && item.exportValue !== null) {
    return getExportText(item.exportValue)
  }

  if (typeof item.value === "string" || typeof item.value === "number") {
    return getExportText(item.value)
  }

  return "—"
}

function isImageSource(value: string) {
  return /^(data:image\/[a-z0-9.+-]+;base64,|https?:\/\/|blob:|\/)/i.test(value.trim())
}

function getImageFetchCredentials(value: string): RequestCredentials {
  if (typeof window === "undefined") {
    return "omit"
  }

  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin ? "include" : "omit"
  } catch {
    return "omit"
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()

    if (!source.startsWith("data:")) {
      image.crossOrigin = "anonymous"
    }

    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

async function resolveCanvasImage(value: string) {
  const imageSource = value.trim()

  if (!imageSource || !isImageSource(imageSource)) {
    return null
  }

  if (imageSource.startsWith("data:") || imageSource.startsWith("blob:")) {
    return loadImage(imageSource)
  }

  try {
    const response = await fetch(imageSource, {
      credentials: getImageFetchCredentials(imageSource),
      mode: "cors",
    })

    if (!response.ok) {
      return null
    }

    const blob = await response.blob()

    if (!blob.type.toLowerCase().startsWith("image/")) {
      return null
    }

    const objectUrl = URL.createObjectURL(blob)
    const image = await loadImage(objectUrl)
    URL.revokeObjectURL(objectUrl)

    return image
  } catch {
    return null
  }
}

function roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
  strokeStyle?: string,
) {
  roundRectPath(context, x, y, width, height, radius)
  context.fillStyle = fillStyle
  context.fill()

  if (strokeStyle) {
    context.strokeStyle = strokeStyle
    context.lineWidth = 2
    context.stroke()
  }
}

function setCanvasFont(context: CanvasRenderingContext2D, size: number, weight: number | "normal" | "bold" = "normal") {
  context.font = `${weight} ${size}px ${IMAGE_FONT}`
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const normalizedText = getExportText(text).replace(/\s+/g, " ")
  const words = normalizedText.split(" ")
  const lines: string[] = []
  let line = ""

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word

    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
      return
    }

    lines.push(line)
    line = word
  })

  if (line) {
    lines.push(line)
  }

  return lines.length > 0 ? lines : ["—"]
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines?: number,
) {
  const lines = wrapText(context, text, maxWidth)
  const visibleLines = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines
  const renderedLines = [...visibleLines]

  if (typeof maxLines === "number" && lines.length > maxLines && renderedLines.length > 0) {
    const lastLineIndex = renderedLines.length - 1
    const lastLine = renderedLines[lastLineIndex]
    renderedLines[lastLineIndex] = lastLine.length > 3 ? `${lastLine.slice(0, Math.max(0, lastLine.length - 3))}...` : "..."
  }

  renderedLines.forEach((line, index) => {
    context.fillText(line, x, y + index * IMAGE_LINE_HEIGHT)
  })

  return y + Math.max(renderedLines.length, 1) * IMAGE_LINE_HEIGHT
}

function getWrappedTextHeight(context: CanvasRenderingContext2D, text: string, width: number, maxLines?: number) {
  const lineCount = wrapText(context, text, width).length
  return Math.max(1, typeof maxLines === "number" ? Math.min(lineCount, maxLines) : lineCount) * IMAGE_LINE_HEIGHT
}

function drawImageInside(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const ratio = Math.min(maxWidth / Math.max(image.naturalWidth, 1), maxHeight / Math.max(image.naturalHeight, 1))
  const width = Math.max(1, image.naturalWidth * ratio)
  const height = Math.max(1, image.naturalHeight * ratio)

  context.drawImage(image, x, y, width, height)
}

function getFieldHeight(context: CanvasRenderingContext2D, field: ImageField, width: number) {
  if (field.image) {
    return 122
  }

  setCanvasFont(context, 22, 700)
  return 38 + getWrappedTextHeight(context, field.value, width, 4)
}

function drawField(context: CanvasRenderingContext2D, field: ImageField, x: number, y: number, width: number) {
  setCanvasFont(context, 17, 800)
  context.fillStyle = IMAGE_ACCENT
  context.fillText(field.label.toUpperCase(), x, y)

  if (field.image) {
    drawImageInside(context, field.image, x, y + 18, Math.min(180, width), 86)
    return
  }

  setCanvasFont(context, 22, 700)
  context.fillStyle = IMAGE_TEXT
  drawWrappedText(context, field.value, x, y + 34, width, 4)
}

function buildSummaryRecords(context: CanvasRenderingContext2D, fields: ImageField[]) {
  if (fields.length === 0) {
    return {
      height: 0,
      rows: [] as ImageField[][],
    }
  }

  const gap = 18
  const columns = 4
  const contentWidth = IMAGE_WIDTH - IMAGE_MARGIN * 2
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns
  const rows: ImageField[][] = []

  for (let index = 0; index < fields.length; index += columns) {
    rows.push(fields.slice(index, index + columns))
  }

  setCanvasFont(context, 22, 700)

  const height = rows.reduce((total, row) => {
    const rowHeight = Math.max(...row.map((field) => getFieldHeight(context, field, cardWidth - 40)), 98)
    return total + rowHeight + gap
  }, 52)

  return {
    height,
    rows,
  }
}

function drawSummary(
  context: CanvasRenderingContext2D,
  fields: ImageField[],
  startY: number,
) {
  if (fields.length === 0) {
    return startY
  }

  const gap = 18
  const columns = 4
  const contentWidth = IMAGE_WIDTH - IMAGE_MARGIN * 2
  const cardWidth = (contentWidth - gap * (columns - 1)) / columns
  const { rows } = buildSummaryRecords(context, fields)
  let y = startY

  setCanvasFont(context, 26, 900)
  context.fillStyle = IMAGE_TEXT
  context.fillText("Summary", IMAGE_MARGIN, y)
  y += 32

  rows.forEach((row) => {
    const rowHeight = Math.max(...row.map((field) => getFieldHeight(context, field, cardWidth - 40)), 98)

    row.forEach((field, columnIndex) => {
      const x = IMAGE_MARGIN + columnIndex * (cardWidth + gap)

      fillRoundedRect(context, x, y, cardWidth, rowHeight, IMAGE_CARD_RADIUS, "#ecfeff", "#cffafe")
      drawField(context, field, x + 20, y + 34, cardWidth - 40)
    })

    y += rowHeight + gap
  })

  return y + 24
}

function getRecordHeight(context: CanvasRenderingContext2D, record: ImageRecord, width: number) {
  const gap = 18
  const fieldWidth = (width - 48 - gap) / 2
  const rowHeights: number[] = []

  for (let index = 0; index < record.fields.length; index += 2) {
    rowHeights.push(
      Math.max(
        getFieldHeight(context, record.fields[index], fieldWidth),
        record.fields[index + 1] ? getFieldHeight(context, record.fields[index + 1], fieldWidth) : 0,
      ),
    )
  }

  return 92 + rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * 16
}

function drawRecord(context: CanvasRenderingContext2D, record: ImageRecord, index: number, startY: number) {
  const cardWidth = IMAGE_WIDTH - IMAGE_MARGIN * 2
  const gap = 18
  const fieldWidth = (cardWidth - 48 - gap) / 2
  const cardHeight = record.height
  let fieldY = startY + 76

  fillRoundedRect(context, IMAGE_MARGIN, startY, cardWidth, cardHeight, IMAGE_CARD_RADIUS, "#ffffff", IMAGE_BORDER)
  fillRoundedRect(context, IMAGE_MARGIN, startY, cardWidth, 54, IMAGE_CARD_RADIUS, IMAGE_HEADER)

  setCanvasFont(context, 22, 900)
  context.fillStyle = "#ffffff"
  context.fillText(`${index + 1}. ${record.title}`, IMAGE_MARGIN + 24, startY + 35)

  for (let fieldIndex = 0; fieldIndex < record.fields.length; fieldIndex += 2) {
    const leftField = record.fields[fieldIndex]
    const rightField = record.fields[fieldIndex + 1]
    const leftHeight = getFieldHeight(context, leftField, fieldWidth)
    const rightHeight = rightField ? getFieldHeight(context, rightField, fieldWidth) : 0
    const rowHeight = Math.max(leftHeight, rightHeight)

    drawField(context, leftField, IMAGE_MARGIN + 24, fieldY, fieldWidth)

    if (rightField) {
      drawField(context, rightField, IMAGE_MARGIN + 24 + fieldWidth + gap, fieldY, fieldWidth)
    }

    fieldY += rowHeight + 16
  }

  return startY + cardHeight + 22
}

function createMeasurementContext() {
  const canvas = document.createElement("canvas")
  canvas.width = IMAGE_WIDTH
  canvas.height = 100
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Unable to prepare image export.")
  }

  return context
}

async function buildSummaryImageFields(summary: PreviewSummaryItem[]) {
  return Promise.all(
    summary.map(async (item) => {
      const imageSource = item.imageValue?.trim() ?? ""
      const image = imageSource ? await resolveCanvasImage(imageSource) : null

      return {
        label: item.label,
        value: getSummaryExportText(item),
        imageSource,
        image,
      }
    }),
  )
}

async function buildRowImageFields<T extends object>(row: T, columns: PreviewColumn<T>[], rowIndex: number) {
  return Promise.all(
    columns.map(async (column) => {
      const imageSource = getImageExportValue(row, column, rowIndex).trim()
      const image = imageSource ? await resolveCanvasImage(imageSource) : null

      return {
        label: column.header,
        value: getExportText(getCellValue(row, column, rowIndex)),
        imageSource,
        image,
      }
    }),
  )
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function Preview<T extends object>({
  isOpen,
  title,
  subtitle,
  fileName,
  summary = [],
  rows,
  columns,
  isLoading = false,
  children,
  onClose,
}: PreviewProps<T>) {
  const [isExportingImage, setIsExportingImage] = useState(false)

  if (!isOpen) {
    return null
  }

  const safeFileName = sanitizeFileName(fileName || title)

  async function downloadImage() {
    if (typeof document === "undefined") return

    setIsExportingImage(true)

    try {
      const measurementContext = createMeasurementContext()
      const summaryFields = await buildSummaryImageFields(summary)
      const summaryLayout = buildSummaryRecords(measurementContext, summaryFields)
      const detailRecords = await Promise.all(
        rows.map(async (row, index) => {
          const fields = await buildRowImageFields(row, columns, index)
          const titleField = fields[0]?.value ? fields[0].value : `Record ${index + 1}`
          const record: ImageRecord = {
            title: titleField,
            fields,
            height: 0,
          }

          record.height = getRecordHeight(measurementContext, record, IMAGE_WIDTH - IMAGE_MARGIN * 2)
          return record
        }),
      )
      const detailsHeight = detailRecords.reduce((total, record) => total + record.height + 22, rows.length > 0 ? 60 : 0)
      const headerHeight = 160
      const footerHeight = 72
      const imageHeight = Math.max(900, headerHeight + summaryLayout.height + detailsHeight + footerHeight)
      const canvas = document.createElement("canvas")
      canvas.width = IMAGE_WIDTH
      canvas.height = imageHeight
      const context = canvas.getContext("2d")

      if (!context) {
        throw new Error("Unable to create image export.")
      }

      context.fillStyle = IMAGE_BACKGROUND
      context.fillRect(0, 0, IMAGE_WIDTH, imageHeight)

      fillRoundedRect(context, 36, 32, IMAGE_WIDTH - 72, 104, 32, IMAGE_HEADER)
      setCanvasFont(context, 34, 900)
      context.fillStyle = "#ffffff"
      context.fillText(title, IMAGE_MARGIN, 78)

      setCanvasFont(context, 20, 500)
      context.fillStyle = "#cffafe"
      drawWrappedText(context, subtitle || "SurveyStat image export", IMAGE_MARGIN, 110, IMAGE_WIDTH - IMAGE_MARGIN * 2, 1)

      let y = 180
      y = drawSummary(context, summaryFields, y)

      if (detailRecords.length > 0) {
        setCanvasFont(context, 26, 900)
        context.fillStyle = IMAGE_TEXT
        context.fillText("Details", IMAGE_MARGIN, y)
        y += 30

        detailRecords.forEach((record, index) => {
          y = drawRecord(context, record, index, y)
        })
      }

      setCanvasFont(context, 18, 600)
      context.fillStyle = IMAGE_MUTED
      context.fillText("Generated by SurveyStat", IMAGE_MARGIN, imageHeight - 34)

      downloadDataUrl(canvas.toDataURL("image/png"), `${safeFileName}.png`)
    } catch (error) {
      console.error(error)
    } finally {
      setIsExportingImage(false)
    }
  }

  const isDownloadDisabled = isLoading || isExportingImage

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-xs flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/30 sm:max-w-6xl sm:rounded-3xl">
        <div className="flex flex-col gap-4 bg-slate-950 p-4 text-white sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950">
              <Maximize2 className="size-5" />
            </span>
            <div>
              <p className="max-w-xs truncate text-xs font-black uppercase tracking-widest text-cyan-200 sm:max-w-none">Preview</p>
              <h2 className="mt-1 line-clamp-2 max-w-xs text-xl font-black tracking-tight wrap-anywhere sm:max-w-none sm:text-2xl">{title}</h2>
              {subtitle ? <p className="mt-2 line-clamp-2 max-w-xs text-sm leading-6 text-slate-300 wrap-anywhere sm:max-w-none">{subtitle}</p> : null}
            </div>
          </div>

          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              onClick={() => void downloadImage()}
              disabled={isDownloadDisabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
            >
              <Download className="size-4" />
              {isExportingImage ? "Creating Image..." : "Download Image"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/10 p-2.5 text-white transition hover:bg-white/20 sm:w-auto"
              aria-label="Close preview"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {summary.length > 0 ? (
            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summary.map((item) => (
                <div key={item.label} className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                  <p className="max-w-xs truncate text-xs font-black uppercase tracking-wide text-cyan-700 sm:max-w-none">{item.label}</p>
                  <div className="mt-2 max-w-xs text-lg font-black text-slate-950 wrap-anywhere sm:max-w-none">{item.value ?? "—"}</div>
                </div>
              ))}
            </div>
          ) : null}

          {children}

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {columns.map((column) => (
                      <th key={String(column.key)} className="px-4 py-3 font-black text-slate-700">
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {isLoading ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center font-semibold text-slate-500">
                        Loading preview...
                      </td>
                    </tr>
                  ) : rows.length > 0 ? (
                    rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="align-top">
                        {columns.map((column) => (
                          <td key={String(column.key)} className="max-w-xs px-4 py-3 text-slate-700 wrap-anywhere">
                            {(() => {
                              const renderedValue = getRenderedCellValue(row, column, rowIndex)
                              return renderedValue === "" || renderedValue === null || renderedValue === undefined ? "—" : renderedValue
                            })()}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center font-semibold text-slate-500">
                        No preview rows available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Preview