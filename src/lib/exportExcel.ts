import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import * as XLSX from "xlsx-js-style"

import type { WorkbookCell, WorkbookSheet } from "@/lib/statisticsWorkbook"

const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const MIN_COLUMN_WIDTH = 12
const MAX_COLUMN_WIDTH = 52

const HEADER_BORDER = {
  top: { style: "thin", color: { rgb: "FF0E7490" } },
  bottom: { style: "thin", color: { rgb: "FF0E7490" } },
  left: { style: "thin", color: { rgb: "FF67E8F9" } },
  right: { style: "thin", color: { rgb: "FF67E8F9" } },
}

const BODY_BORDER = {
  bottom: { style: "thin", color: { rgb: "FFE2E8F0" } },
}

const EMPHASIS_BORDER = {
  top: { style: "thin", color: { rgb: "FF67E8F9" } },
  bottom: { style: "thin", color: { rgb: "FF67E8F9" } },
}

const TITLE_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 15 },
  fill: { patternType: "solid", fgColor: { rgb: "FF0F172A" } },
  alignment: { horizontal: "left", vertical: "center" },
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FF0E7490" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: HEADER_BORDER,
}

const BODY_STYLE = {
  font: { color: { rgb: "FF0F172A" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFFFFFFF" } },
  alignment: { vertical: "center" },
  border: BODY_BORDER,
}

const ALT_BODY_STYLE = {
  ...BODY_STYLE,
  fill: { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } },
}

const KEY_METRIC_STYLE = {
  font: { bold: true, color: { rgb: "FF164E63" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFECFEFF" } },
  border: BODY_BORDER,
}

const SUBTOTAL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FF164E63" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFCFFAFE" } },
  border: EMPHASIS_BORDER,
}

const GRAND_TOTAL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FFFFFFFF" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FF155E75" } },
  border: EMPHASIS_BORDER,
}

const SECTION_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FF0E7490" }, sz: 10 },
  fill: { patternType: "solid", fgColor: { rgb: "FFECFEFF" } },
  border: EMPHASIS_BORDER,
  alignment: { horizontal: "left", vertical: "center" },
}

const PERCENTAGE_STYLE = {
  ...BODY_STYLE,
  font: { color: { rgb: "FF475569" }, sz: 9 },
  fill: { patternType: "solid", fgColor: { rgb: "FFF8FAFC" } },
}

const COVER_LABEL_STYLE = {
  ...BODY_STYLE,
  font: { bold: true, color: { rgb: "FF334155" }, sz: 10 },
}

const COVER_VALUE_STYLE = {
  ...BODY_STYLE,
  font: { color: { rgb: "FF0F172A" }, sz: 10 },
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
  return typeof row[0] === "string" && row[0].startsWith("Percentage Distribution")
}

function isCoverSectionRow(sheet: WorkbookSheet, row: WorkbookCell[]) {
  return sheet.name === "Cover"
    && typeof row[0] === "string"
    && ["Report Information", "At a Glance", "Likert Scale Guide"].includes(row[0])
    && (row[1] ?? "") === ""
}

function isSectionRow(sheet: WorkbookSheet, row: WorkbookCell[]) {
  return isBlockLabelRow(row) || isCoverSectionRow(sheet, row)
}

function isBlankRow(row: WorkbookCell[]) {
  return row.every((value) => value === null || value === "")
}

function isPercentageRow(sheet: WorkbookSheet, rowIndex: number) {
  if (sheet.name !== "Tally") return false

  const blockIndex = sheet.rows.findIndex(isBlockLabelRow)
  return blockIndex >= 0 && rowIndex > blockIndex
}

function isKeyMetricColumn(sheet: WorkbookSheet, columnIndex: number) {
  if (sheet.name === "Cover" || sheet.name === "Solution" || sheet.name === "Raw Responses") return false

  const header = sheet.columns[columnIndex]?.header ?? ""
  return /weighted mean|interpretation|rank/i.test(header)
}

function cellText(value: WorkbookCell) {
  return value === null ? "" : String(value)
}

function calculateColumnWidth(sheet: WorkbookSheet, columnIndex: number) {
  const configuredWidth = sheet.columns[columnIndex]?.width
  const values = [
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
    vertical: statementColumn ? "top" : "center",
    wrapText: statementColumn,
  }
}

function getNumberFormat(sheet: WorkbookSheet, rowIndex: number, columnIndex: number) {
  if (isPercentageRow(sheet, rowIndex) && columnIndex >= 3 && columnIndex <= 7) {
    return '0.00"%"'
  }

  return sheet.columns[columnIndex]?.numFmt
}

function getFreezeColumnCount(sheetName: string) {
  if (sheetName === "Tally" || sheetName === "Item Statistics") return 3
  if (sheetName === "Raw Responses") return 2
  if (["Section Summary", "Response Source", "Solution"].includes(sheetName)) return 1
  return 0
}

function getZoomScale(sheetName: string) {
  if (sheetName === "Tally") return 80
  if (sheetName === "Item Statistics" || sheetName === "Raw Responses") return 85
  if (sheetName === "Cover") return 100
  return 95
}

function getRowHeight(sheet: WorkbookSheet, row: WorkbookCell[], rowIndex: number) {
  if (rowIndex === 0) return 30
  if (rowIndex === 1) return 34
  if (isBlankRow(row)) return 10
  if (isSectionRow(sheet, row)) return 24

  if ((sheet.name === "Tally" || sheet.name === "Item Statistics") && typeof row[2] === "string") {
    if (row[2].length > 95) return 44
    if (row[2].length > 55) return 34
  }

  if (sheet.name === "Solution") return 30
  return 22
}

function getBaseStyle(sheet: WorkbookSheet, row: WorkbookCell[], rowIndex: number) {
  if (isGrandTotalRow(row)) return GRAND_TOTAL_STYLE
  if (isSubtotalRow(row)) return SUBTOTAL_STYLE
  if (isSectionRow(sheet, row)) return SECTION_STYLE
  if (isPercentageRow(sheet, rowIndex)) return PERCENTAGE_STYLE
  return rowIndex % 2 === 0 ? BODY_STYLE : ALT_BODY_STYLE
}

function applyCellStyle(
  cell: XLSX.CellObject,
  baseStyle: Record<string, unknown>,
  sheet: WorkbookSheet,
  row: WorkbookCell[],
  rowIndex: number,
  columnIndex: number,
  value: WorkbookCell,
) {
  let style = baseStyle

  if (
    isKeyMetricColumn(sheet, columnIndex)
    && !isSubtotalRow(row)
    && !isGrandTotalRow(row)
    && !isSectionRow(sheet, row)
    && !isPercentageRow(sheet, rowIndex)
  ) {
    style = KEY_METRIC_STYLE
  }

  if (sheet.name === "Cover" && !isSectionRow(sheet, row) && !isBlankRow(row)) {
    style = columnIndex === 0 ? COVER_LABEL_STYLE : COVER_VALUE_STYLE
  }

  cell.s = {
    ...style,
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
  const merges = [
    XLSX.utils.decode_range(`A1:${XLSX.utils.encode_col(columnCount - 1)}1`),
  ]

  sheet.rows.forEach((row, rowIndex) => {
    if (!isSectionRow(sheet, row)) return
    const worksheetRow = rowIndex + 2
    merges.push({
      s: { r: worksheetRow, c: 0 },
      e: { r: worksheetRow, c: columnCount - 1 },
    })
  })

  sheet.notes?.forEach((_, noteIndex) => {
    const worksheetRow = notesStartIndex + noteIndex
    merges.push({
      s: { r: worksheetRow, c: 0 },
      e: { r: worksheetRow, c: columnCount - 1 },
    })
  })

  worksheet["!merges"] = merges
  worksheet["!cols"] = sheet.columns.map((_, columnIndex) => ({
    wch: calculateColumnWidth(sheet, columnIndex),
  }))
  worksheet["!rows"] = aoa.map((row, rowIndex) => ({
    hpt: rowIndex < 2 ? getRowHeight(sheet, row, rowIndex) : getRowHeight(sheet, row, rowIndex),
  }))

  const freezeColumns = getFreezeColumnCount(sheet.name)
  worksheet["!freeze"] = {
    xSplit: freezeColumns,
    ySplit: 2,
    topLeftCell: `${XLSX.utils.encode_col(freezeColumns)}3`,
    activePane: freezeColumns > 0 ? "bottomRight" : "bottomLeft",
    state: "frozen",
  }

  if (sheet.name !== "Cover" && sheet.rows.length > 0) {
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
    const baseStyle = getBaseStyle(sheet, row, rowIndex)

    row.forEach((value, columnIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 2, c: columnIndex })
      const cell = worksheet[address]
      if (cell) {
        applyCellStyle(cell, baseStyle, sheet, row, rowIndex, columnIndex, value)
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

function buildPaneXml(freezeColumns: number) {
  const xSplit = freezeColumns > 0 ? ` xSplit="${freezeColumns}"` : ""
  const topLeftCell = `${XLSX.utils.encode_col(freezeColumns)}3`
  const activePane = freezeColumns > 0 ? "bottomRight" : "bottomLeft"

  return `<pane${xSplit} ySplit="2" topLeftCell="${topLeftCell}" activePane="${activePane}" state="frozen"/>`
}

function injectSheetViewPresentation(xml: string, freezeColumns: number, zoomScale: number) {
  const pane = buildPaneXml(freezeColumns)
  const selfClosingView = /<sheetView([^>]*)\/>/
  const openingView = /<sheetView([^>]*)>/

  function cleanAttributes(attributes: string) {
    return attributes.replace(/\s(?:showGridLines|zoomScale|zoomScaleNormal)="[^"]*"/g, "")
  }

  if (selfClosingView.test(xml)) {
    return xml.replace(selfClosingView, (_, attributes: string) => {
      const cleaned = cleanAttributes(attributes)
      return `<sheetView${cleaned} showGridLines="0" zoomScale="${zoomScale}" zoomScaleNormal="100">${pane}</sheetView>`
    })
  }

  if (openingView.test(xml)) {
    const hasPane = xml.includes("<pane ")
    return xml.replace(openingView, (_, attributes: string) => {
      const cleaned = cleanAttributes(attributes)
      const opening = `<sheetView${cleaned} showGridLines="0" zoomScale="${zoomScale}" zoomScaleNormal="100">`
      return hasPane ? opening : `${opening}${pane}`
    })
  }

  return xml
}

function applySheetPresentation(buffer: ArrayBuffer, sheetNames: string[]) {
  const archive = unzipSync(new Uint8Array(buffer))
  const worksheetPaths = Object.keys(archive)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/sheet(\d+)\.xml$/)?.[1] ?? 0)
      const rightNumber = Number(right.match(/sheet(\d+)\.xml$/)?.[1] ?? 0)
      return leftNumber - rightNumber
    })

  worksheetPaths.forEach((path, index) => {
    const sheetName = sheetNames[index] ?? ""
    const xml = strFromU8(archive[path])
    archive[path] = strToU8(
      injectSheetViewPresentation(xml, getFreezeColumnCount(sheetName), getZoomScale(sheetName)),
    )
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
  const polishedWorkbook = applySheetPresentation(buffer, workbook.SheetNames)
  const blobBuffer = new Uint8Array(polishedWorkbook.byteLength)
  blobBuffer.set(polishedWorkbook)

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
