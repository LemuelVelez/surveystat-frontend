import type { ReactNode } from "react"
import { Download, FileText, Maximize2, X } from "lucide-react"
import { jsPDF } from "jspdf"

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

type PdfImage = {
  dataUrl: string
  format: "JPEG" | "PNG" | "WEBP"
  width: number
  height: number
}

type PdfField = {
  label: string
  value: string
  image: PdfImage | null
  hasImageSource: boolean
}

const PDF_MARGIN = 32
const PDF_LINE_HEIGHT = 11
const PDF_CARD_RADIUS = 12

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

function isDataImageValue(value: string) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim())
}

function isSupportedPdfDataImage(value: string) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(value.trim())
}

function isFetchableImageValue(value: string) {
  return /^(https?:\/\/|blob:|\/)/i.test(value.trim())
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

function getImageFormat(value: string): PdfImage["format"] {
  const match = value.match(/^data:image\/(png|jpe?g|webp);base64,/i)
  const format = match?.[1]?.toLowerCase()

  if (format === "jpg") return "JPEG"
  if (format === "jpeg") return "JPEG"
  if (format === "webp") return "WEBP"

  return "PNG"
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

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image data."))
    reader.readAsDataURL(blob)
  })
}

function getImageDimensions(source: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      })
    }
    image.onerror = () => resolve(null)
    image.src = source
  })
}

async function convertImageToPngDataUrl(source: string) {
  const dimensions = await getImageDimensions(source)

  if (!dimensions || typeof document === "undefined") {
    return ""
  }

  const image = new Image()

  return new Promise<string>((resolve) => {
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = dimensions.width
      canvas.height = dimensions.height

      const context = canvas.getContext("2d")

      if (!context) {
        resolve("")
        return
      }

      context.drawImage(image, 0, 0, dimensions.width, dimensions.height)

      try {
        resolve(canvas.toDataURL("image/png"))
      } catch {
        resolve("")
      }
    }
    image.onerror = () => resolve("")
    image.src = source
  })
}

async function resolvePdfImage(value: string): Promise<PdfImage | null> {
  const imageSource = value.trim()

  if (!imageSource) {
    return null
  }

  try {
    let dataUrl = ""

    if (isDataImageValue(imageSource)) {
      dataUrl = isSupportedPdfDataImage(imageSource) ? imageSource : await convertImageToPngDataUrl(imageSource)
    } else if (isFetchableImageValue(imageSource)) {
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

      const blobDataUrl = await readBlobAsDataUrl(blob)
      dataUrl = isSupportedPdfDataImage(blobDataUrl) ? blobDataUrl : await convertImageToPngDataUrl(blobDataUrl)
    }

    if (!dataUrl || !isSupportedPdfDataImage(dataUrl)) {
      return null
    }

    const dimensions = await getImageDimensions(dataUrl)

    return {
      dataUrl,
      format: getImageFormat(dataUrl),
      width: dimensions?.width ?? 1,
      height: dimensions?.height ?? 1,
    }
  } catch {
    return null
  }
}

function addPageIfNeeded(document: jsPDF, currentY: number, requiredHeight: number) {
  const pageHeight = document.internal.pageSize.getHeight()

  if (currentY + requiredHeight <= pageHeight - PDF_MARGIN) {
    return currentY
  }

  document.addPage()
  return PDF_MARGIN
}

function splitText(document: jsPDF, value: string, maxWidth: number) {
  return document.splitTextToSize(value || "—", maxWidth) as string[]
}

function drawWrappedText(document: jsPDF, text: string, x: number, y: number, maxWidth: number, maxLines?: number) {
  const lines = splitText(document, text, maxWidth)
  const visibleLines = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines

  visibleLines.forEach((line, index) => {
    document.text(line, x, y + index * PDF_LINE_HEIGHT)
  })

  return y + Math.max(visibleLines.length, 1) * PDF_LINE_HEIGHT
}

function drawPdfImage(document: jsPDF, image: PdfImage, x: number, y: number, maxWidth: number, maxHeight: number) {
  const widthRatio = maxWidth / Math.max(image.width, 1)
  const heightRatio = maxHeight / Math.max(image.height, 1)
  const ratio = Math.min(widthRatio, heightRatio)
  const width = Math.max(1, image.width * ratio)
  const height = Math.max(1, image.height * ratio)

  document.addImage(image.dataUrl, image.format, x, y, width, height)
}

function getFieldHeight(document: jsPDF, field: PdfField, width: number) {
  if (field.image) {
    return 72
  }

  document.setFont("helvetica", "normal")
  document.setFontSize(8)

  return 19 + splitText(document, field.value, width).length * PDF_LINE_HEIGHT
}

function drawField(document: jsPDF, field: PdfField, x: number, y: number, width: number) {
  document.setFont("helvetica", "bold")
  document.setFontSize(7.5)
  document.setTextColor(71, 85, 105)
  document.text(field.label.toUpperCase(), x, y)

  if (field.image) {
    drawPdfImage(document, field.image, x, y + 8, Math.min(128, width), 52)
    return
  }

  document.setFont("helvetica", "normal")
  document.setFontSize(8)
  document.setTextColor(15, 23, 42)
  drawWrappedText(document, field.value, x, y + 13, width)
}

function drawSummaryCards(document: jsPDF, fields: PdfField[], startY: number) {
  if (fields.length === 0) {
    return startY
  }

  const pageWidth = document.internal.pageSize.getWidth()
  const contentWidth = pageWidth - PDF_MARGIN * 2
  const gap = 10
  const cardsPerRow = 4
  const cardWidth = (contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow
  const cardHeight = 74
  let y = addPageIfNeeded(document, startY, 24 + cardHeight)

  document.setFont("helvetica", "bold")
  document.setFontSize(10)
  document.setTextColor(15, 23, 42)
  document.text("Summary", PDF_MARGIN, y)
  y += 12

  fields.forEach((field, index) => {
    const columnIndex = index % cardsPerRow

    if (columnIndex === 0 && index > 0) {
      y = addPageIfNeeded(document, y + cardHeight + gap, cardHeight)
    }

    const x = PDF_MARGIN + columnIndex * (cardWidth + gap)

    document.setDrawColor(207, 250, 254)
    document.setFillColor(236, 254, 255)
    document.roundedRect(x, y, cardWidth, cardHeight, PDF_CARD_RADIUS, PDF_CARD_RADIUS, "FD")

    drawField(document, field, x + 12, y + 18, cardWidth - 24)
  })

  return y + cardHeight + 22
}

function getRowCardHeight(document: jsPDF, fields: PdfField[], cardWidth: number) {
  const gap = 12
  const fieldWidth = (cardWidth - 32 - gap) / 2
  const rowHeights: number[] = []

  for (let index = 0; index < fields.length; index += 2) {
    rowHeights.push(
      Math.max(
        getFieldHeight(document, fields[index], fieldWidth),
        fields[index + 1] ? getFieldHeight(document, fields[index + 1], fieldWidth) : 0,
      ),
    )
  }

  return 48 + rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * 10
}

function drawRowCard(document: jsPDF, fields: PdfField[], rowNumber: number, startY: number) {
  const pageWidth = document.internal.pageSize.getWidth()
  const cardWidth = pageWidth - PDF_MARGIN * 2
  const gap = 12
  const fieldWidth = (cardWidth - 32 - gap) / 2
  const cardHeight = getRowCardHeight(document, fields, cardWidth)
  const y = addPageIfNeeded(document, startY, cardHeight)
  let fieldY = y + 40

  document.setDrawColor(226, 232, 240)
  document.setFillColor(255, 255, 255)
  document.roundedRect(PDF_MARGIN, y, cardWidth, cardHeight, PDF_CARD_RADIUS, PDF_CARD_RADIUS, "FD")

  document.setFillColor(15, 23, 42)
  document.roundedRect(PDF_MARGIN, y, cardWidth, 28, PDF_CARD_RADIUS, PDF_CARD_RADIUS, "F")
  document.setTextColor(255, 255, 255)
  document.setFont("helvetica", "bold")
  document.setFontSize(10)
  document.text(`Record ${rowNumber}`, PDF_MARGIN + 14, y + 18)

  for (let index = 0; index < fields.length; index += 2) {
    const leftField = fields[index]
    const rightField = fields[index + 1]
    const leftHeight = getFieldHeight(document, leftField, fieldWidth)
    const rightHeight = rightField ? getFieldHeight(document, rightField, fieldWidth) : 0
    const rowHeight = Math.max(leftHeight, rightHeight)

    drawField(document, leftField, PDF_MARGIN + 16, fieldY, fieldWidth)

    if (rightField) {
      drawField(document, rightField, PDF_MARGIN + 16 + fieldWidth + gap, fieldY, fieldWidth)
    }

    fieldY += rowHeight + 10
  }

  return y + cardHeight + 14
}

async function buildSummaryPdfFields(summary: PreviewSummaryItem[]) {
  return Promise.all(
    summary.map(async (item) => {
      const imageSource = item.imageValue?.trim() ?? ""
      const image = imageSource ? await resolvePdfImage(imageSource) : null

      return {
        label: item.label,
        value: getSummaryExportText(item),
        image,
        hasImageSource: Boolean(imageSource),
      }
    }),
  )
}

async function buildRowPdfFields<T extends object>(row: T, columns: PreviewColumn<T>[], rowIndex: number) {
  return Promise.all(
    columns.map(async (column) => {
      const imageSource = getImageExportValue(row, column, rowIndex).trim()
      const image = imageSource ? await resolvePdfImage(imageSource) : null
      const value = getExportText(getCellValue(row, column, rowIndex))

      return {
        label: column.header,
        value,
        image,
        hasImageSource: Boolean(imageSource),
      }
    }),
  )
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
  if (!isOpen) {
    return null
  }

  const safeFileName = sanitizeFileName(fileName || title)

  async function downloadPdf() {
    const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    const pageWidth = document.internal.pageSize.getWidth()

    document.setFillColor(15, 23, 42)
    document.roundedRect(32, 28, pageWidth - 64, 82, 18, 18, "F")
    document.setTextColor(255, 255, 255)
    document.setFont("helvetica", "bold")
    document.setFontSize(18)
    document.text(title, 54, 64)
    document.setFont("helvetica", "normal")
    document.setFontSize(10)
    document.setTextColor(207, 250, 254)
    document.text(subtitle || "SurveyStat preview and export", 54, 84, {
      maxWidth: pageWidth - 108,
    })

    let startY = 132
    const summaryFields = await buildSummaryPdfFields(summary)
    startY = drawSummaryCards(document, summaryFields, startY)

    if (rows.length > 0) {
      document.setFont("helvetica", "bold")
      document.setFontSize(10)
      document.setTextColor(15, 23, 42)
      startY = addPageIfNeeded(document, startY, 24)
      document.text("Details", PDF_MARGIN, startY)
      startY += 12

      for (let index = 0; index < rows.length; index += 1) {
        const rowFields = await buildRowPdfFields(rows[index], columns, index)
        startY = drawRowCard(document, rowFields, index + 1, startY)
      }
    }

    document.save(`${safeFileName}.pdf`)
  }

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
              onClick={() => void downloadPdf()}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
            >
              <FileText className="size-4" />
              Download PDF
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

          {children ? <div className="mb-5">{children}</div> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            {isLoading ? (
              <div className="flex min-h-60 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-500">
                Preparing preview...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-60 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-500">
                No rows available to preview.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Record {rowIndex + 1}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
                        {columns.length} fields
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {columns.map((column) => (
                        <div key={String(column.key)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="max-w-xs truncate text-xs font-black uppercase tracking-wide text-slate-500">{column.header}</p>
                          <div className="mt-1 max-w-xs text-sm font-semibold leading-6 text-slate-800 wrap-anywhere">
                            {getRenderedCellValue(row, column, rowIndex)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Download className="size-4" />
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Preview