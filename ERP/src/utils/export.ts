import * as XLSX from 'xlsx';
import { formatDate } from './format';

export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; title: string }[],
  filename: string
) {
  const rows = data.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col) => {
      obj[col.title] = row[col.key];
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}_${formatDate(new Date().toISOString())}.xlsx`);
}

export function exportSheetsToExcel(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet, index) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ 提示: '暂无数据' }];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name || `Sheet${index + 1}`);
  });

  XLSX.writeFile(wb, `${filename}_${formatDate(new Date().toISOString())}.xlsx`);
}
