import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import * as XLSX from "xlsx-js-style"

import type { WorkbookCell, WorkbookSheet } from "@/lib/statisticsWorkbook"

const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const MIN_COLUMN_WIDTH = 12
const MAX_COLUMN_WIDTH = 60

const THIN_BORDER = {
  top: { style: "thin", color: { rgb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { rgb: "FFE2E8F0" } },
  left: { style: "thin", color: { rgb: "FFE2E8F0" } },
  right: { style: "thin", color: { rgb: "FFE2E8F0" } },
}

const TITLE_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 16 },
  fill: { patternType: "solid", fgColor: { rgb: "FF0F172A" } },
  alignment: { horizontal: "left", vertical: "center" },
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 11 },
  fill: { patternType: "solid", fgColor: { rgb: "FF0891B2" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: THIN_BORDER,
}

const BODY_STYLE = {
  font: { color: { rgb: "FF0F172A" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFFFFFFF" } },
  alignment: { vertical: "top" },
  border: THIN_BORDER,
}

const ALT_BODY_STYLE = {
  ...BODY_STYLE,
  fill: { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } },
}

const SUBTOTAL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FF164E63" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFCFFAFE" } },
}

const GRAND_TOTAL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FF155E75" } },
}

const BLOCK_LABEL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FF0E7490" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFECFEFF" } },
}

const NOTE_STYLE = {
  font: { italic: true, color: { rgb: "FF64748B" }, sz: 9 },
  alignment: { vertical: "top", wrapText: true },
}

function isSubtotalRow(row: WorkbookCell[]) {
  return typeof row[0] === "string" && row[0].startsWith("Subtotal ·")
}

function isGrandTotalRow(row: WorkbookCell[]) {
  return row[0] === "Grand Total / Overall"
}

function isBlockLabelRow(row: WorkbookCell[]) {
  return row[0] === "Percentage Distribution"
}

function isPercentageRow(sheet: WorkbookSheet, rowIndex: number) {
  if (sheet.name !== "Tally") return false

  const blockIndex = sheet.rows.findIndex(isBlockLabelRow)
  return blockIndex >= 0 && rowIndex > blockIndex
}

function cellText(value: WorkbookCell) {
  return value === null ? "" : String(value)
}

function calculateColumnWidth(sheet: WorkbookSheet, columnIndex: number) {
  const configuredWidth = sheet.columns[columnIndex]?.width
  const values = [
    sheet.title,
    sheet.columns[columnIndex]?.header ?? "",
    ...sheet.rows.map((row) => row[columnIndex] ?? ""),
  ]
  const longest = values.reduce<number>((maximum, value) => Math.max(maximum, cellText(value).length), 0)
  const width = configuredWidth ?? longest + 2

  return Math.min(Math.max(width, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
}

function getAlignment(sheet: WorkbookSheet, columnIndex: number, value: WorkbookCell) {
  const configured = sheet.columns[columnIndex]?.align
  const horizontal = configured ?? (typeof value === "number" ? "right" : "left")
  const statementColumn = /statement|substitution|formula|result|value/i.test(sheet.columns[columnIndex]?.header ?? "")

  return {
    horizontal,
    vertical: "top",
    wrapText: statementColumn,
  }
}

function getNumberFormat(sheet: WorkbookSheet, rowIndex: number, columnIndex: number) {
  if (isPercentageRow(sheet, rowIndex) && columnIndex >= 3 && columnIndex <= 7) {
    return '0.00"%"'
  }

  return sheet.columns[columnIndex]?.numFmt
}

function applyCellStyle(
  cell: XLSX.CellObject,
  baseStyle: Record<string, unknown>,
  sheet: WorkbookSheet,
  rowIndex: number,
  columnIndex: number,
  value: WorkbookCell,
) {
  cell.s = {
    ...baseStyle,
    alignment: getAlignment(sheet, columnIndex, value),
  }

  const numFmt = typeof value === "number" ? getNumberFormat(sheet, rowIndex, columnIndex) : undefined
  if (numFmt) {
    cell.z = numFmt
  }
}

function createWorksheet(sheet: WorkbookSheet) {
  const columnCount = Math.max(sheet.columns.length, 1)
  const aoa: WorkbookCell[][] = [
    [sheet.title],
    sheet.columns.map((column) => column.header),
    ...sheet.rows,
  ]
  const notesStartIndex = aoa.length + 1

  if (sheet.notes?.length) {
    aoa.push([])
    sheet.notes.forEach((note) => aoa.push([note]))
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet["!merges"] = [
    XLSX.utils.decode_range(`A1:${XLSX.utils.encode_col(columnCount - 1)}1`),
  ]
  worksheet["!cols"] = sheet.columns.map((_, columnIndex) => ({
    wch: calculateColumnWidth(sheet, columnIndex),
  }))
  worksheet["!rows"] = aoa.map((_, rowIndex) => ({
    hpt: rowIndex === 0 ? 28 : rowIndex === 1 ? 30 : 20,
  }))
  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 2,
    topLeftCell: "A3",
    activePane: "bottomLeft",
    state: "frozen",
  }

  if (sheet.rows.length > 0) {
    const firstDataRow = 3
    const blockIndex = sheet.rows.findIndex((row) => isGrandTotalRow(row) || isBlockLabelRow(row))
    const lastDataRow = blockIndex >= 0 ? Math.max(firstDataRow, blockIndex + 2) : sheet.rows.length + 2
    worksheet["!autofilter"] = {
      ref: `A2:${XLSX.utils.encode_col(columnCount - 1)}${lastDataRow}`,
    }
  }

  const titleCell = worksheet.A1
  if (titleCell) {
    titleCell.s = TITLE_STYLE
  }

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const address = XLSX.utils.encode_cell({ r: 1, c: columnIndex })
    const cell = worksheet[address]
    if (cell) cell.s = HEADER_STYLE
  }

  sheet.rows.forEach((row, rowIndex) => {
    const baseStyle = isGrandTotalRow(row)
      ? GRAND_TOTAL_STYLE
      : isSubtotalRow(row)
        ? SUBTOTAL_STYLE
        : isBlockLabelRow(row)
          ? BLOCK_LABEL_STYLE
          : rowIndex % 2 === 0
            ? BODY_STYLE
            : ALT_BODY_STYLE

    row.forEach((value, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 2, c: columnIndex })
      const cell = worksheet[address]
      if (cell) {
        applyCellStyle(cell, baseStyle, sheet, rowIndex, columnIndex, value)
      }
    })
  })

  sheet.notes?.forEach((_, noteIndex) => {
    const address = XLSX.utils.encode_cell({ r: notesStartIndex + noteIndex, c: 0 })
    const cell = worksheet[address]
    if (cell) cell.s = NOTE_STYLE
  })

  return worksheet
}


function injectFrozenPane(xml: string) {
  if (xml.includes("<pane ")) return xml

  const pane = '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>'
  const selfClosingView = /<sheetView([^>]*)\/>/

  if (selfClosingView.test(xml)) {
    return xml.replace(selfClosingView, `<sheetView$1>${pane}</sheetView>`)
  }

  return xml.replace(/<sheetView([^>]*)>/, `<sheetView$1>${pane}`)
}

function applyFrozenPanes(buffer: ArrayBuffer) {
  const archive = unzipSync(new Uint8Array(buffer))

  Object.keys(archive).forEach((path) => {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) return

    const xml = strFromU8(archive[path])
    archive[path] = strToU8(injectFrozenPane(xml))
  })

  return zipSync(archive, { level: 6 })
}

export function sheetsToWorkbook(sheets: WorkbookSheet[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  sheets.forEach((sheet) => {
    const worksheet = createWorksheet(sheet)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  return workbook
}

export function writeWorkbookToBlob(workbook: XLSX.WorkBook): Blob {
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  }) as ArrayBuffer
  const frozenWorkbook = applyFrozenPanes(buffer)
  const blobBuffer = new Uint8Array(frozenWorkbook.byteLength)
  blobBuffer.set(frozenWorkbook)

  return new Blob([blobBuffer.buffer], { type: MIME_TYPE })
}

export async function downloadStatisticsWorkbook(sheets: WorkbookSheet[], fileName: string): Promise<void> {
  const workbook = sheetsToWorkbook(sheets)
  const blob = writeWorkbookToBlob(workbook)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  try {
    link.href = url
    link.download = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}
