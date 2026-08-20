import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { getTempFileURL, uploadFile } from './cloudStorage';
import { formatDate } from './format';
import { isMiniProgramWebView, openNativeFile } from './miniProgramPreview';
import { normalizeAttachments, resolveAttachmentUrl } from './financeAttachments';
import type { AttachmentValue } from '@/types';

export interface PaymentApplicationExportItem {
  applicant: string;
  applicationDate?: string;
  payeeName?: string;
  payeeBank?: string;
  payeeAccount?: string;
  projectAddress?: string;
  ownerName?: string;
  paymentType?: string;
  paymentPurpose?: string;
  amount: number;
  amountUppercase?: string;
  projectManager?: string;
  approverNames?: string;
  payerNames?: string;
  remark?: string;
  attachments?: AttachmentValue[];
}

export interface ImportedPaymentApplication {
  applicant: string;
  applicationDate: string;
  payeeName: string;
  payeeBank: string;
  payeeAccount: string;
  projectAddress: string;
  ownerName: string;
  paymentType: string;
  paymentPurpose: string;
  amount: number;
  amountUppercase: string;
  projectManager: string;
  approverNames: string;
  payerNames: string;
  remark: string;
  sheetName: string;
}

const TEMPLATE_URL = `${import.meta.env.BASE_URL || '/'}templates/payment-application-template.xlsx`;

function cleanSheetName(value: string, index: number) {
  const name = (value || `付款申请单${index + 1}`)
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
    .slice(0, 26);
  return `${name || '付款申请单'}${index + 1}`;
}

function fileDate() {
  return formatDate(new Date().toISOString()).replace(/-/g, '');
}

function displayDate(value?: string) {
  if (!value) return formatDate(new Date().toISOString());
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const date = new Date(time);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function xmlEscape(value: string | number | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getCellStyle(cellXml: string | undefined) {
  return cellXml?.match(/\ss="([^"]+)"/)?.[1];
}

function getExistingCellXml(sheetXml: string, address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cellPattern = /<c\b[^>]*\/>|<c\b[^>]*>.*?<\/c>/gs;
  const match = Array.from(sheetXml.matchAll(cellPattern)).find((item) => (
    new RegExp(`\\br="${escaped}"(?:\\s|/|>)`).test(item[0])
  ));
  return match?.[0];
}

function buildTextCell(address: string, value: string | undefined, style?: string) {
  const styleAttr = style ? ` s="${style}"` : '';
  return `<c r="${address}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function buildBlankCell(address: string, style?: string) {
  const styleAttr = style ? ` s="${style}"` : '';
  return `<c r="${address}"${styleAttr}/>`;
}

function buildNumberCell(address: string, value: number | undefined, style?: string) {
  const styleAttr = style ? ` s="${style}"` : '';
  const amount = Number.isFinite(value) ? value : 0;
  return `<c r="${address}"${styleAttr}><v>${amount}</v></c>`;
}

function replaceCell(sheetXml: string, address: string, value: string | number | undefined) {
  const existing = getExistingCellXml(sheetXml, address);
  if (!existing) return sheetXml;
  const style = getCellStyle(existing);
  const next = value === undefined || value === ''
    ? buildBlankCell(address, style)
    : typeof value === 'number'
    ? buildNumberCell(address, value, style)
    : buildTextCell(address, value, style);

  return sheetXml.replace(existing, next);
}

const EMU_PER_PIXEL = 9525;
const DEFAULT_COL_WIDTH = 8.43;
const DEFAULT_ROW_HEIGHT = 15;

function colWidthToPixels(width = DEFAULT_COL_WIDTH) {
  return Math.floor(width * 7 + 5);
}

function rowHeightToPixels(height = DEFAULT_ROW_HEIGHT) {
  return height * 96 / 72;
}

function getColumnWidths(sheetXml: string) {
  const widths = new Map<number, number>();
  Array.from(sheetXml.matchAll(/<col\b[^>]*>/g)).forEach((match) => {
    const tag = match[0];
    const min = Number(tag.match(/\bmin="(\d+)"/)?.[1] || 0);
    const max = Number(tag.match(/\bmax="(\d+)"/)?.[1] || min);
    const width = Number(tag.match(/\bwidth="([^"]+)"/)?.[1] || DEFAULT_COL_WIDTH);
    for (let col = min; col <= max; col += 1) widths.set(col - 1, colWidthToPixels(width));
  });
  return widths;
}

function getRowHeights(sheetXml: string) {
  const heights = new Map<number, number>();
  Array.from(sheetXml.matchAll(/<row\b[^>]*>/g)).forEach((match) => {
    const tag = match[0];
    const row = Number(tag.match(/\br="(\d+)"/)?.[1] || 0);
    const height = Number(tag.match(/\bht="([^"]+)"/)?.[1] || DEFAULT_ROW_HEIGHT);
    if (row) heights.set(row - 1, rowHeightToPixels(height));
  });
  return heights;
}

function sumRange(map: Map<number, number>, start: number, endExclusive: number, fallback: number) {
  let total = 0;
  for (let index = start; index < endExclusive; index += 1) total += map.get(index) || fallback;
  return total;
}

function buildOneCellAnchor(
  id: number,
  name: string,
  relationshipId: string,
  col: number,
  row: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
) {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${Math.round(offsetX * EMU_PER_PIXEL)}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${Math.round(offsetY * EMU_PER_PIXEL)}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(width * EMU_PER_PIXEL)}" cy="${Math.round(height * EMU_PER_PIXEL)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${xmlEscape(name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(width * EMU_PER_PIXEL)}" cy="${Math.round(height * EMU_PER_PIXEL)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

export function rmbUppercase(amount: number | undefined) {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric === 0) return '零元整';

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const sectionUnits = ['', '万', '亿', '兆'];
  const digitUnits = ['', '拾', '佰', '仟'];
  const sign = numeric < 0 ? '负' : '';
  const cents = Math.round(Math.abs(numeric) * 100);
  const integerPart = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;

  const sectionToChinese = (section: number) => {
    let result = '';
    let zeroPending = false;
    for (let i = 3; i >= 0; i -= 1) {
      const divisor = 10 ** i;
      const digit = Math.floor(section / divisor) % 10;
      if (digit === 0) {
        if (result && section % divisor > 0) zeroPending = true;
      } else {
        result += `${zeroPending ? '零' : ''}${digits[digit]}${digitUnits[i]}`;
        zeroPending = false;
      }
    }
    return result;
  };

  const sections: number[] = [];
  let number = integerPart;
  while (number > 0) {
    sections.push(number % 10000);
    number = Math.floor(number / 10000);
  }

  let integerText = '';
  let zeroBetweenSections = false;
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const section = sections[i];
    if (section === 0) {
      zeroBetweenSections = Boolean(integerText);
      continue;
    }
    if (integerText && (zeroBetweenSections || section < 1000)) integerText += '零';
    integerText += `${sectionToChinese(section)}${sectionUnits[i]}`;
    zeroBetweenSections = false;
  }
  integerText = integerText || '零';

  let decimalText = '';
  if (jiao) decimalText += `${digits[jiao]}角`;
  if (fen) decimalText += `${digits[fen]}分`;
  if (!decimalText) decimalText = '整';
  if (integerPart === 0 && decimalText !== '整') return `${sign}${decimalText}`;
  return `${sign}${integerText}元${decimalText}`;
}

function fillFormXml(sheetXml: string, item: PaymentApplicationExportItem, offset: number) {
  const row = (n: number) => n + offset;
  let nextXml = sheetXml;
  nextXml = replaceCell(nextXml, `A${row(3)}`, displayDate(item.applicationDate));
  nextXml = replaceCell(nextXml, `B${row(4)}`, item.payeeName);
  nextXml = replaceCell(nextXml, `F${row(4)}`, item.projectAddress);
  nextXml = replaceCell(nextXml, `B${row(5)}`, item.payeeBank);
  nextXml = replaceCell(nextXml, `F${row(5)}`, item.ownerName);
  nextXml = replaceCell(nextXml, `B${row(6)}`, item.payeeAccount);
  nextXml = replaceCell(nextXml, `F${row(6)}`, item.paymentType);
  nextXml = replaceCell(nextXml, `B${row(7)}`, item.amountUppercase !== undefined ? item.amountUppercase : rmbUppercase(item.amount));
  nextXml = replaceCell(nextXml, `F${row(7)}`, item.paymentPurpose);
  nextXml = replaceCell(nextXml, `B${row(8)}`, item.amount);
  nextXml = replaceCell(nextXml, `B${row(9)}`, item.applicant);
  nextXml = replaceCell(nextXml, `D${row(9)}`, item.projectManager);
  nextXml = replaceCell(nextXml, `F${row(9)}`, item.approverNames);
  nextXml = replaceCell(nextXml, `H${row(9)}`, item.payerNames);
  nextXml = replaceCell(nextXml, `B${row(10)}`, item.remark);
  return nextXml;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function deliverFile(blob: Blob, filename: string) {
  if (!isMiniProgramWebView()) {
    downloadBlob(blob, filename);
    return;
  }

  const file = new File([blob], filename, { type: blob.type });
  const uploaded = await uploadFile(file, `finance/payment-application-exports/${fileDate()}`);
  const urlMap = await getTempFileURL([uploaded.fileID]);
  const url = urlMap[uploaded.fileID];
  if (!url) throw new Error('付款申请单下载地址生成失败，请稍后重试');
  if (!openNativeFile(url, filename, 'open')) {
    throw new Error('小程序文件页面打开失败，请关闭页面后重试');
  }
}

type ExportImage = {
  name: string;
  extension: 'png' | 'jpeg';
  contentType: 'image/png' | 'image/jpeg';
  data: Uint8Array;
  width: number;
  height: number;
};

async function getImageSize(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = reject;
    });
    image.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadExportImages(item: PaymentApplicationExportItem): Promise<ExportImage[]> {
  const attachments = normalizeAttachments(item.attachments).filter((attachment) => attachment.type === 'image');
  const images: ExportImage[] = [];
  for (const [index, attachment] of attachments.entries()) {
    try {
      const url = await resolveAttachmentUrl(attachment);
      if (!url) continue;
      const response = await fetch(url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const size = await getImageSize(blob);
      const mime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const extension = mime === 'image/png' ? 'png' : 'jpeg';
      images.push({
        name: attachment.name || `附件${index + 1}.${extension}`,
        extension,
        contentType: mime,
        data: new Uint8Array(await blob.arrayBuffer()),
        width: size.width,
        height: size.height,
      });
    } catch (error) {
      console.warn('付款申请单附件图片读取失败', error);
    }
  }
  return images;
}

function ensureContentTypesXml(xml: string, images: ExportImage[]) {
  let next = xml;
  if (images.some((image) => image.extension === 'png') && !next.includes('Extension="png"')) {
    next = next.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  }
  if (images.some((image) => image.extension === 'jpeg') && !next.includes('Extension="jpeg"')) {
    next = next.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  }
  if (!next.includes('PartName="/xl/drawings/drawing1.xml"')) {
    next = next.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  return next;
}

function ensureWorksheetDrawing(sheetXml: string, relationshipId: string) {
  let next = sheetXml.includes('xmlns:r=')
    ? sheetXml
    : sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  if (!next.includes('<drawing ')) {
    next = next.replace('</worksheet>', `<drawing r:id="${relationshipId}"/></worksheet>`);
  }
  return next;
}

function buildSheetRelsXml(drawingRelationshipId: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${drawingRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
}

function buildDrawingXml(sheetXml: string, images: ExportImage[]) {
  const columnWidths = getColumnWidths(sheetXml);
  const rowHeights = getRowHeights(sheetXml);
  const areaCol = 1;
  const areaEndCol = 8;
  const areaRows = [9, 19];
  const areaWidth = sumRange(columnWidths, areaCol, areaEndCol, colWidthToPixels());
  const anchors: string[] = [];
  let imageId = 1;

  areaRows.forEach((areaRow, copyIndex) => {
    const areaHeight = rowHeights.get(areaRow) || rowHeightToPixels(150);
    const columns = Math.max(1, Math.ceil(Math.sqrt(images.length)));
    const rows = Math.max(1, Math.ceil(images.length / columns));
    const cellWidth = areaWidth / columns;
    const cellHeight = areaHeight / rows;
    images.forEach((image, index) => {
      const gridCol = index % columns;
      const gridRow = Math.floor(index / columns);
      const maxWidth = Math.max(1, cellWidth - 8);
      const maxHeight = Math.max(1, cellHeight - 8);
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      const offsetX = gridCol * cellWidth + (cellWidth - width) / 2;
      const offsetY = gridRow * cellHeight + (cellHeight - height) / 2;
      anchors.push(buildOneCellAnchor(
        imageId,
        `${copyIndex + 1}-${image.name}`,
        `rId${imageId}`,
        areaCol,
        areaRow,
        offsetX,
        offsetY,
        width,
        height,
      ));
      imageId += 1;
    });
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`;
}

function buildDrawingRelsXml(images: ExportImage[]) {
  const relationships: string[] = [];
  let imageId = 1;
  for (let copy = 0; copy < 2; copy += 1) {
    images.forEach((image, index) => {
      relationships.push(`<Relationship Id="rId${imageId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/payment-remark-${copy + 1}-${index + 1}.${image.extension}"/>`);
      imageId += 1;
    });
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`;
}

function addRemarkImagesToTemplate(zip: Record<string, Uint8Array>, sheetXml: string, images: ExportImage[]) {
  if (!images.length) return sheetXml;
  const drawingRelationshipId = 'rIdPaymentRemarkImages';
  zip['[Content_Types].xml'] = strToU8(ensureContentTypesXml(strFromU8(zip['[Content_Types].xml']), images));
  zip['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8(buildSheetRelsXml(drawingRelationshipId));
  zip['xl/drawings/drawing1.xml'] = strToU8(buildDrawingXml(sheetXml, images));
  zip['xl/drawings/_rels/drawing1.xml.rels'] = strToU8(buildDrawingRelsXml(images));
  for (let copy = 0; copy < 2; copy += 1) {
    images.forEach((image, index) => {
      zip[`xl/media/payment-remark-${copy + 1}-${index + 1}.${image.extension}`] = image.data;
    });
  }
  return ensureWorksheetDrawing(sheetXml, drawingRelationshipId);
}

async function buildExactTemplateFile(item: PaymentApplicationExportItem) {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('付款申请单模板读取失败');
  const buffer = new Uint8Array(await response.arrayBuffer());
  const zip = unzipSync(buffer);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheet = zip[sheetPath];
  if (!sheet) throw new Error('付款申请单模板结构异常');
  let sheetXml = strFromU8(sheet);
  sheetXml = fillFormXml(sheetXml, item, 0);
  sheetXml = fillFormXml(sheetXml, item, 10);
  sheetXml = addRemarkImagesToTemplate(zip, sheetXml, await loadExportImages(item));
  zip[sheetPath] = strToU8(sheetXml);
  delete zip['xl/calcChain.xml'];
  return zipSync(zip, { level: 6 });
}

export async function exportPaymentApplications(items: PaymentApplicationExportItem[]) {
  if (!items.length) return;
  if (items.length === 1) {
    const file = await buildExactTemplateFile(items[0]);
    await deliverFile(
      new Blob([file], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `付款申请单_${cleanSheetName(items[0].projectAddress || items[0].payeeName || items[0].applicant, 0)}_${fileDate()}.xlsx`,
    );
    return;
  }

  const files: Record<string, Uint8Array> = {};
  for (const [index, item] of items.entries()) {
    const name = cleanSheetName(item.projectAddress || item.payeeName || item.applicant, index);
    files[`付款申请单_${name}_${fileDate()}.xlsx`] = await buildExactTemplateFile(item);
  }
  const zipped = zipSync(files, { level: 6 });
  await deliverFile(new Blob([zipped], { type: 'application/zip' }), `付款申请单_${fileDate()}.zip`);
}

function getCellValue(sheet: any, address: string) {
  const cell = sheet[address];
  if (!cell) return '';
  if (cell.w !== undefined) return String(cell.w).trim();
  if (cell.v !== undefined) return String(cell.v).trim();
  return '';
}

function getCellNumber(sheet: any, address: string) {
  const value = sheet[address]?.v;
  if (typeof value === 'number') return value;
  const text = getCellValue(sheet, address).replace(/[¥,\s]/g, '');
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

function parseExcelDate(value: any, XLSX: any) {
  if (typeof value === 'number' && XLSX.SSF?.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }
  const text = String(value || '').trim();
  if (!text) return todayDateForImport();
  const time = new Date(text.replace(/[./年]/g, '-').replace('月', '-').replace('日', '')).getTime();
  return Number.isNaN(time) ? text : formatDate(new Date(time).toISOString());
}

function todayDateForImport() {
  return formatDate(new Date().toISOString());
}

function parseSheet(sheet: any, sheetName: string, XLSX: any): ImportedPaymentApplication | null {
  const rawDate = sheet.A3?.v || sheet.A13?.v || getCellValue(sheet, 'A3') || getCellValue(sheet, 'A13');
  const item: ImportedPaymentApplication = {
    applicant: getCellValue(sheet, 'B9') || getCellValue(sheet, 'B19'),
    applicationDate: parseExcelDate(rawDate, XLSX),
    payeeName: getCellValue(sheet, 'B4') || getCellValue(sheet, 'B14'),
    payeeBank: getCellValue(sheet, 'B5') || getCellValue(sheet, 'B15'),
    payeeAccount: getCellValue(sheet, 'B6') || getCellValue(sheet, 'B16'),
    projectAddress: getCellValue(sheet, 'F4') || getCellValue(sheet, 'F14'),
    ownerName: getCellValue(sheet, 'F5') || getCellValue(sheet, 'F15'),
    paymentType: getCellValue(sheet, 'F6') || getCellValue(sheet, 'F16'),
    paymentPurpose: getCellValue(sheet, 'F7') || getCellValue(sheet, 'F17'),
    amount: getCellNumber(sheet, 'B8') || getCellNumber(sheet, 'B18'),
    amountUppercase: getCellValue(sheet, 'B7') || getCellValue(sheet, 'B17'),
    projectManager: getCellValue(sheet, 'D9') || getCellValue(sheet, 'D19'),
    approverNames: getCellValue(sheet, 'F9') || getCellValue(sheet, 'F19'),
    payerNames: getCellValue(sheet, 'H9') || getCellValue(sheet, 'H19'),
    remark: getCellValue(sheet, 'B10') || getCellValue(sheet, 'B20'),
    sheetName,
  };

  const hasContent = [
    item.applicant,
    item.payeeName,
    item.payeeBank,
    item.payeeAccount,
    item.projectAddress,
    item.ownerName,
    item.paymentPurpose,
    item.remark,
  ].some(Boolean) || item.amount > 0;

  return hasContent ? item : null;
}

export async function parsePaymentApplicationsFromFile(file: File): Promise<ImportedPaymentApplication[]> {
  const XLSX = await import('xlsx-js-style');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true } as any);
  return workbook.SheetNames
    .map((sheetName: string) => parseSheet(workbook.Sheets[sheetName], sheetName, XLSX))
    .filter(Boolean) as ImportedPaymentApplication[];
}
