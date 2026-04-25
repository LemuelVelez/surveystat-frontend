import type { ReactNode } from "react"
import { Download, FileSpreadsheet, FileText, Maximize2, X } from "lucide-react"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

export type PreviewColumn<T extends object> = {
  key: keyof T | string
  header: string
  getValue?: (row: T, index: number) => string | number | null | undefined
}

export type PreviewSummaryItem = {
  label: string
  value: string | number | null | undefined
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

function getExportRows<T extends object>(rows: T[], columns: PreviewColumn<T>[]) {
  return rows.map((row, index) =>
    columns.reduce<Record<string, string | number>>((record, column) => {
      const value = getCellValue(row, column, index)

      record[column.header] = typeof value === "number" ? value : String(value)
      return record
    }, {}),
  )
}

function getSummaryRows(summary: PreviewSummaryItem[]) {
  return summary.map((item) => ({
    Field: item.label,
    Value: item.value ?? "",
  }))
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
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

  function downloadExcel() {
    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.json_to_sheet(getSummaryRows(summary))
    const rowsSheet = XLSX.utils.json_to_sheet(getExportRows(rows, columns))

    summarySheet["!cols"] = [{ wch: 28 }, { wch: 52 }]
    rowsSheet["!cols"] = columns.map((column) => ({
      wch: Math.max(18, Math.min(56, column.header.length + 10)),
    }))

    const styleHeader = (sheet: XLSX.WorkSheet) => {
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")

      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: column })
        const cell = sheet[cellRef] as (XLSX.CellObject & { s?: unknown }) | undefined

        if (cell) {
          cell.s = {
            fill: { fgColor: { rgb: "0F172A" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
          }
        }
      }
    }

    styleHeader(summarySheet)
    styleHeader(rowsSheet)

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary")
    XLSX.utils.book_append_sheet(workbook, rowsSheet, "Details")

    const workbookOutput = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    } as XLSX.WritingOptions)

    downloadBlob(
      new Blob([workbookOutput], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${safeFileName}.xlsx`,
    )
  }

  function downloadPdf() {
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

    if (summary.length > 0) {
      autoTable(document, {
        startY,
        head: [["Summary", "Value"]],
        body: summary.map((item) => [String(item.label), String(item.value ?? "")]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 7,
          textColor: [15, 23, 42],
        },
        headStyles: {
          fillColor: [8, 145, 178],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [236, 254, 255],
        },
      })

      startY = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 24
        : startY + 120
    }

    autoTable(document, {
      startY,
      head: [columns.map((column) => column.header)],
      body: rows.map((row, index) => columns.map((column) => String(getCellValue(row, column, index)))),
      theme: "striped",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 6,
        textColor: [30, 41, 59],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 32, right: 32 },
    })

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
              onClick={downloadExcel}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
            >
              <FileSpreadsheet className="size-4" />
              Download Excel
            </button>
            <button
              type="button"
              onClick={downloadPdf}
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
                  <p className="mt-2 max-w-xs text-lg font-black text-slate-950 wrap-anywhere sm:max-w-none">{item.value ?? "—"}</p>
                </div>
              ))}
            </div>
          ) : null}

          {children ? <div className="mb-5">{children}</div> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {isLoading ? (
              <div className="flex min-h-60 items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">
                Preparing preview...
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-60 items-center justify-center bg-slate-50 text-sm font-bold text-slate-500">
                No rows available to preview.
              </div>
            ) : (
              <>
                <div className="space-y-3 sm:hidden">
                  {rows.map((row, rowIndex) => (
                    <div key={rowIndex} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      {columns.map((column) => (
                        <div key={String(column.key)} className="border-b border-slate-100 py-2 last:border-b-0">
                          <p className="max-w-xs truncate text-xs font-black uppercase tracking-wide text-slate-500">{column.header}</p>
                          <p className="mt-1 max-w-xs text-sm font-semibold text-slate-800 wrap-anywhere">
                            {getCellValue(row, column, rowIndex)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      {columns.map((column) => (
                        <th key={String(column.key)} className="px-4 py-3 font-black">
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-slate-200 odd:bg-white even:bg-slate-50">
                        {columns.map((column) => (
                          <td key={String(column.key)} className="px-4 py-3 align-top text-slate-700">
                            {getCellValue(row, column, rowIndex)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={downloadExcel}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Download className="size-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={downloadPdf}
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