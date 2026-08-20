import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '@/components/Modal';
import { useFinanceStore } from '@/store/financeStore';
import { useBizStore } from '@/store/bizStore';
import { useAuthStore } from '@/store/authStore';
import { useDialogStore } from '@/store/dialogStore';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  expenseCategoryPayload,
  loadExpenseCategories,
  loadIncomeCategories,
  type ExpenseCategory,
  type ExpenseCategoryPath,
} from '@/services/expenseCategories';
import { generateId } from '@/utils/format';
import type { BizType, Contract, Expense, Receipt } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

type ImportRow = Record<string, any>;

type ParsedImport = {
  contracts: Contract[];
  contractUpdates: Contract[];
  receipts: Receipt[];
  expenses: Expense[];
  errors: string[];
  warnings: string[];
};

const CONTRACT_SHEET = '合同项目导入';
const INCOME_SHEET = '收入流水导入';
const EXPENSE_SHEET = '支出流水导入';

const homeContractHeaders = [
  '合同编号',
  '归属项目',
  '客户名称',
  '客户电话',
  '签约日期',
  '合同金额',
  '项目地址',
  '合同状态',
  '项目经理',
  '预计完工日期',
  '收款阶段1名称',
  '收款阶段1金额',
  '收款阶段2名称',
  '收款阶段2金额',
  '收款阶段3名称',
  '收款阶段3金额',
  '备注',
];

const commercialContractHeaders = [
  '合同编号',
  '项目名称',
  '甲方',
  '乙方',
  '丙方',
  '签约日期',
  '合同金额',
  '项目地址',
  '合同状态',
  '项目经理',
  '预计完工日期',
  '收款阶段1名称',
  '收款阶段1金额',
  '收款阶段2名称',
  '收款阶段2金额',
  '收款阶段3名称',
  '收款阶段3金额',
  '备注',
];

const homeIncomeHeaders = [
  '收款日期',
  '合同编号',
  '归属项目',
  '收款阶段',
  '是否进入合同收款计划',
  '阶段应收金额',
  '一级分类',
  '二级分类',
  '收款金额',
  '收款方式',
  '备注',
];

const commercialIncomeHeaders = [
  '收款日期',
  '合同编号',
  '项目名称',
  '收款阶段',
  '是否进入合同收款计划',
  '阶段应收金额',
  '一级分类',
  '二级分类',
  '收款金额',
  '收款方式',
  '备注',
];

const homeExpenseHeaders = [
  '支出日期',
  '合同编号',
  '归属项目',
  '一级分类',
  '二级分类',
  '支出金额',
  '收款方',
  '支出方式',
  '支付状态',
  '备注',
];

const commercialExpenseHeaders = [
  '支出日期',
  '合同编号',
  '项目名称',
  '一级分类',
  '二级分类',
  '支出金额',
  '收款方',
  '支出方式',
  '支付状态',
  '备注',
];

const requiredHomeContractHeaders = ['合同编号', '归属项目', '客户名称', '签约日期', '合同金额'];
const requiredCommercialContractHeaders = ['合同编号', '项目名称', '甲方', '签约日期', '合同金额'];
const requiredIncomeHeaders = ['收款日期', '合同编号', '收款阶段', '是否进入合同收款计划', '阶段应收金额', '一级分类', '二级分类', '收款金额'];
const requiredExpenseHeaders = ['支出日期', '一级分类', '二级分类', '支出金额'];
const validContractStatuses = new Set(['进行中', '已完工', '已结算']);
const validExpenseStatuses = new Set(['已付', '未付']);
const PAYMENT_METHODS = ['银行转账', '微信', '支付宝', '现金', '其他'];

const trimValue = (value: unknown) => String(value ?? '').trim();

function numberValue(value: unknown) {
  if (typeof value === 'number') return value;
  const cleaned = trimValue(value).replace(/[,+￥¥\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBlank(value: unknown) {
  return trimValue(value) === '';
}

function isValidMoney(value: unknown) {
  if (isBlank(value)) return false;
  return numberValue(value) > 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = trimValue(value).replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return '';
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '', raw: false });
}

function missingHeaders(rows: ImportRow[], requiredHeaders: string[]) {
  if (rows.length === 0) return [];
  const present = new Set(Object.keys(rows[0]));
  return requiredHeaders.filter((header) => !present.has(header));
}

function missingHeaderGroups(rows: ImportRow[], requiredGroups: string[][]) {
  if (rows.length === 0) return [];
  const present = new Set(Object.keys(rows[0]));
  return requiredGroups
    .filter((group) => !group.some((header) => present.has(header)))
    .map((group) => group.join('/'));
}

function rowValue(row: ImportRow, keys: string[]) {
  for (const key of keys) {
    const value = trimValue(row[key]);
    if (value) return value;
  }
  return '';
}

function buildPaymentStages(row: ImportRow, amount: number, bizType: BizType) {
  const stages = [1, 2, 3].flatMap((index) => {
    const name = trimValue(row[`收款阶段${index}名称`]);
    const stageAmount = numberValue(row[`收款阶段${index}金额`]);
    if (!name && !stageAmount) return [];
    if (!name || !stageAmount) return [];
    return [{ name, amount: stageAmount, ratio: amount > 0 ? stageAmount / amount : 0 }];
  });
  return stages.length > 0 ? stages : [{ name: bizType === '工装' ? '回款' : '合同款', amount, ratio: 1 }];
}

function getCategoryRows(categories: ExpenseCategory[]) {
  return categories.flatMap((category) => category.children.map((child) => [category.name, child.name]));
}

function strictCategoryPath(
  categories: ExpenseCategory[],
  primaryName: string,
  secondaryName: string,
): ExpenseCategoryPath | null {
  const primary = categories.find((category) => category.name === primaryName);
  const secondary = primary?.children.find((child) => child.name === secondaryName);
  if (!primary || !secondary) return null;
  return {
    primaryId: primary.id,
    primaryName: primary.name,
    secondaryId: secondary.id,
    secondaryName: secondary.name,
  };
}

function categoryExistsElsewhere(categories: ExpenseCategory[], secondaryName: string) {
  return categories.find((category) => category.children.some((child) => child.name === secondaryName));
}

function applyWorksheetBasics(sheet: XLSX.WorkSheet, headerCount: number, sampleRows: number[] = [], requiredHeaders: string[] = []) {
  sheet['!cols'] = Array.from({ length: headerCount }, () => ({ wch: 16 }));
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const requiredSet = new Set(requiredHeaders);
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) {
      const required = requiredSet.has(String(cell.v || ''));
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: required ? 'DC2626' : '166534' } },
        alignment: { horizontal: 'center' },
      };
    }
  }
  sampleRows.forEach((rowIndex) => {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
      if (cell) {
        cell.s = {
          ...(cell.s || {}),
          font: { ...(cell.s?.font || {}), color: { rgb: 'FF0000' } },
        };
      }
    }
  });
}

function appendStyledSheet(excel: typeof XLSX, workbook: XLSX.WorkBook, name: string, rows: any[][], requiredHeaders: string[] = [], sampleRows: number[] = []) {
  const sheet = excel.utils.aoa_to_sheet(rows);
  applyWorksheetBasics(sheet, rows[0]?.length || 1, sampleRows, requiredHeaders);
  excel.utils.book_append_sheet(workbook, sheet, name);
}

function buildTemplateWorkbook(excel: typeof XLSX, expenseCategories: ExpenseCategory[], incomeCategories: ExpenseCategory[], bizType: BizType) {
  const workbook = excel.utils.book_new();
  const isCommercial = bizType === '工装';
  const contractHeaders = isCommercial ? commercialContractHeaders : homeContractHeaders;
  const incomeHeaders = isCommercial ? commercialIncomeHeaders : homeIncomeHeaders;
  const expenseHeaders = isCommercial ? commercialExpenseHeaders : homeExpenseHeaders;
  const requiredContractHeaders = isCommercial ? requiredCommercialContractHeaders : requiredHomeContractHeaders;
  const projectLabel = isCommercial ? '项目名称' : '归属项目';
  const firstIncomeCategory = getCategoryRows(incomeCategories)[0] || ['工程款项', isCommercial ? '回款' : '合同款'];
  const firstExpenseCategory = getCategoryRows(expenseCategories)[0] || ['材料费', '主材采购'];

  appendStyledSheet(excel, workbook, '导入流程', [
    ['步骤', '要做什么', '说明'],
    ['1', '下载模板', '请先下载本模板，不要自行改表头。红色表头为必填字段，红色字体示例行导入前请整行删除。'],
    ['2', '整理合同/项目', `ERP 中不存在的历史${isCommercial ? '工装合同' : '家装合同'}，先填到“${CONTRACT_SHEET}”。已存在合同可不填合同页。`],
    ['3', '整理收入', `收款记录填到“${INCOME_SHEET}”，字段对应 ERP 的新增收款弹窗。`],
    ['4', '整理支出', `支出记录填到“${EXPENSE_SHEET}”，字段对应 ERP 的新增支出弹窗；非项目支出可不填合同编号。`],
    ['5', '上传导入', '系统会先导入合同，再按合同编号导入收入和支出。'],
  ]);

  const contractExample = isCommercial
    ? ['示例-导入前删除', '某商业办公室装修项目', '兰州某某科技有限公司', '品诺筑家装饰工程有限公司', '监理单位/无', '2026-04-23', 300000, '兰州市城关区某办公楼', '进行中', '张三', '2026-08-31', '回款', 270000, '质保金', 30000, '', '', '示例行，正式导入前请整行删除']
    : ['示例-导入前删除', '核城家园2区3-1-502', '马金莲', '13800000000', '2024-01-15', 58000, '核城家园2区3-1-502', '进行中', '张三', '', '定金', 10000, '中期款', 28000, '尾款', 20000, '示例行，正式导入前请整行删除'];
  appendStyledSheet(excel, workbook, CONTRACT_SHEET, [contractHeaders, contractExample], requiredContractHeaders, [1]);

  const incomeExample = isCommercial
    ? ['2026-04-28', '示例-导入前删除', '某商业办公室装修项目', '首期回款', '是', 100000, firstIncomeCategory[0], firstIncomeCategory[1], 50000, '银行转账', '示例行，正式导入前请整行删除']
    : ['2024-01-21', '示例-导入前删除', '核城家园2区3-1-502', '首期款', '是', 10000, firstIncomeCategory[0], firstIncomeCategory[1], 1000, '银行转账', '示例行，正式导入前请整行删除'];
  appendStyledSheet(excel, workbook, INCOME_SHEET, [incomeHeaders, incomeExample], requiredIncomeHeaders, [1]);

  const expenseExample = isCommercial
    ? ['2026-05-12', '示例-导入前删除', '某商业办公室装修项目', firstExpenseCategory[0], firstExpenseCategory[1], 12347, '供应商A', '银行转账', '已付', '示例行，正式导入前请整行删除']
    : ['2024-02-28', '示例-导入前删除', '核城家园2区3-1-502', firstExpenseCategory[0], firstExpenseCategory[1], 12347, '供应商A', '银行转账', '已付', '示例行，正式导入前请整行删除'];
  appendStyledSheet(excel, workbook, EXPENSE_SHEET, [expenseHeaders, expenseExample], requiredExpenseHeaders, [1]);

  const incomeCategoryRows = getCategoryRows(incomeCategories);
  const expenseCategoryRows = getCategoryRows(expenseCategories);
  const optionLength = Math.max(incomeCategoryRows.length, expenseCategoryRows.length, PAYMENT_METHODS.length, validContractStatuses.size, validExpenseStatuses.size, 2);
  const contractStatuses = Array.from(validContractStatuses);
  const expenseStatuses = Array.from(validExpenseStatuses);
  const options = Array.from({ length: optionLength }, (_, index) => [
    incomeCategoryRows[index]?.[0] || '',
    incomeCategoryRows[index]?.[1] || '',
    expenseCategoryRows[index]?.[0] || '',
    expenseCategoryRows[index]?.[1] || '',
    PAYMENT_METHODS[index] || '',
    contractStatuses[index] || '',
    expenseStatuses[index] || '',
    ['是', '否'][index] || '',
  ]);
  appendStyledSheet(excel, workbook, '下拉选项', [
    ['收入一级分类', '收入二级分类', '支出一级分类', '支出二级分类', '收款/支出方式', '合同状态', '支付状态', '是否进入合同收款计划'],
    ...options,
  ]);

  appendStyledSheet(excel, workbook, '字段说明', [
    ['字段', '适用表', '是否必填', '规则'],
    ['合同编号', `${CONTRACT_SHEET}/${INCOME_SHEET}`, '必填', '合同编号用于关联项目；收入必须填写。支出如为非项目支出可留空。'],
    [projectLabel, `${CONTRACT_SHEET}/${INCOME_SHEET}/${EXPENSE_SHEET}`, '合同页必填，流水页选填', '流水页有合同编号即可关联项目；填写时应和合同项目保持一致。'],
    [isCommercial ? '甲方' : '客户名称', CONTRACT_SHEET, '必填', isCommercial ? '对应 ERP 工装合同的甲方。' : '对应 ERP 家装合同的客户姓名。'],
    [isCommercial ? '乙方/丙方' : '客户电话', CONTRACT_SHEET, '选填', isCommercial ? '对应 ERP 工装合同的乙方、丙方；没有丙方可留空。' : '对应 ERP 家装合同的联系电话。'],
    ['项目经理', CONTRACT_SHEET, '选填', '对应 ERP 合同详情里的项目经理/负责人。'],
    ['合同金额/收款金额/支出金额', '对应金额表', '必填', '必须是大于 0 的数字，不要填正负号，例如 1000、12347.50。'],
    ['签约日期/收款日期/支出日期', '对应日期表', '必填', '支持 yyyy-mm-dd、yyyy/m/d、Excel 日期，例如 2026-04-23 或 2026/4/23。'],
    ['合同状态', CONTRACT_SHEET, '选填', '必须使用 ERP 合同状态：进行中、已完工、已结算。'],
    ['收款阶段', INCOME_SHEET, '必填', '可填写合同阶段或自定义阶段；同一合同的阶段名称应保持一致。'],
    ['是否进入合同收款计划', INCOME_SHEET, '必填', '只能填“是”或“否”。填“是”会保留原阶段并追加到合同收款计划；填“否”仅作为本次自定义收款阶段。'],
    ['阶段应收金额', INCOME_SHEET, '新增合同阶段时必填', '填“是”且合同中不存在该阶段时必须填写；这是合同约定应收金额，不是本次实际收款金额。已有阶段或填“否”时可留空。'],
    ['一级分类/二级分类', `${INCOME_SHEET}/${EXPENSE_SHEET}`, '必填', '必须使用 ERP 收支类别管理里的对应收入类别或支出类别；系统不会在导入时自动新增分类。'],
    ['收款方式/支出方式', `${INCOME_SHEET}/${EXPENSE_SHEET}`, '选填', '对应 ERP 表单里的收款方式/支出方式；留空时按空白导入，不会自动补默认值。'],
    ['收款方', EXPENSE_SHEET, '选填', '对应 ERP 新增支出里的“收款方”；不知道或无需记录时可留空。'],
    ['支付状态', EXPENSE_SHEET, '选填', '只能填已付或未付，留空默认已付。'],
    ['备注', '全部', '选填', '对应 ERP 表单里的备注。'],
    ['示例行', '全部示例页', '导入前删除', '红色字体为示例数据，正式导入前请整行删除。'],
  ]);

  return workbook;
}

function parseContractRows(
  rows: ImportRow[],
  currentBizType: BizType,
  existingContractNos: Set<string>,
  contracts: Contract[],
  userName: string,
  errors: string[],
  warnings: string[],
) {
  const contractMap = new Map<string, Contract>();
  const templateContractNos = new Set<string>();
  const now = new Date().toISOString();

  rows.forEach((row, index) => {
    const contractNo = trimValue(row['合同编号']);
    const projectName = currentBizType === '工装' ? rowValue(row, ['项目名称', '归属项目']) : rowValue(row, ['归属项目', '项目名称']);
    const customerName = currentBizType === '工装' ? rowValue(row, ['甲方', '客户名称']) : rowValue(row, ['客户名称', '甲方']);
    const partyB = currentBizType === '工装' ? rowValue(row, ['乙方', '客户电话']) : '';
    const partyC = currentBizType === '工装' ? trimValue(row['丙方']) : '';
    const amount = numberValue(row['合同金额']);
    const signDate = dateValue(row['签约日期']);
    const status = trimValue(row['合同状态']) || '进行中';
    if (!contractNo && !projectName && !customerName) return;
    if (!contractNo || !projectName || !customerName || !amount || !signDate) {
      const rowErrors: string[] = [];
      if (!contractNo) rowErrors.push('合同编号未填');
      if (!projectName) rowErrors.push(`${currentBizType === '工装' ? '项目名称' : '归属项目'}未填`);
      if (!customerName) rowErrors.push(`${currentBizType === '工装' ? '甲方' : '客户名称'}未填`);
      if (!isValidMoney(row['合同金额'])) rowErrors.push('合同金额未填或格式不正确，必须是大于 0 的数字');
      if (!signDate) rowErrors.push('签约日期未填或格式不正确，正确格式：2026-04-23、2026/4/23，或 Excel 日期');
      errors.push(`${CONTRACT_SHEET}第 ${index + 2} 行：${rowErrors.join('；')}`);
      return;
    }
    if (templateContractNos.has(contractNo)) {
      errors.push(`${CONTRACT_SHEET}第 ${index + 2} 行合同编号重复：${contractNo}`);
      return;
    }
    templateContractNos.add(contractNo);
    if (!validContractStatuses.has(status)) {
      errors.push(`${CONTRACT_SHEET}第 ${index + 2} 行合同状态“${status}”不在 ERP 状态中，只能填：进行中、已完工、已结算`);
      return;
    }
    if (existingContractNos.has(contractNo)) {
      warnings.push(`合同 ${contractNo} 已存在于 ERP，合同主档跳过，仅用于匹配流水`);
      return;
    }
    contractMap.set(contractNo, {
      id: generateId(),
      contractNo,
      bizType: currentBizType,
      houseAddress: trimValue(row['项目地址']) || projectName,
      customerName,
      customerPhone: currentBizType === '工装' ? partyB : trimValue(row['客户电话']),
      partyB: currentBizType === '工装' ? partyB : undefined,
      partyC: currentBizType === '工装' ? partyC : undefined,
      contractAmount: amount,
      paymentStages: buildPaymentStages(row, amount, currentBizType),
      status: status as Contract['status'],
      signDate,
      expectedEndDate: dateValue(row['预计完工日期']),
      projectManager: trimValue(row['项目经理']),
      remark: trimValue(row['备注']),
      attachments: [],
      createdAt: now,
      createdBy: userName,
    });
  });

  const availableContracts = new Map<string, Contract>();
  contracts.forEach((contract) => availableContracts.set(contract.contractNo, contract));
  contractMap.forEach((contract) => availableContracts.set(contract.contractNo, contract));

  return { contractMap, availableContracts };
}

function parseIncomeRows(
  rows: ImportRow[],
  currentBizType: BizType,
  availableContracts: Map<string, Contract>,
  receipts: Receipt[],
  incomeCategories: ExpenseCategory[],
  userName: string,
  errors: string[],
  warnings: string[],
) {
  const parsedReceipts: Receipt[] = [];
  const workingContracts = new Map<string, Contract>(Array.from(availableContracts.entries()).map(([contractNo, contract]) => [
    contractNo,
    { ...contract, paymentStages: (contract.paymentStages || []).map((stage) => ({ ...stage })) },
  ]));
  const contractUpdates = new Map<string, Contract>();
  const templateKeys = new Set<string>();
  const existingKeys = new Set(receipts.map((item) => `${item.contractNo}|${item.receiptDate}|${item.amount}|${item.stage}|${item.remark}`));

  rows.forEach((row, index) => {
    const contractNo = trimValue(row['合同编号']);
    const projectName = currentBizType === '工装' ? rowValue(row, ['项目名称', '归属项目']) : rowValue(row, ['归属项目', '项目名称']);
    const date = dateValue(row['收款日期']);
    const stage = trimValue(row['收款阶段']);
    const includeInPlanText = trimValue(row['是否进入合同收款计划']);
    const stagePlanAmount = numberValue(row['阶段应收金额']);
    const primaryCategory = trimValue(row['一级分类']);
    const secondaryCategory = trimValue(row['二级分类']);
    const amount = numberValue(row['收款金额']);
    if (!contractNo && !projectName && !stage && !includeInPlanText && !primaryCategory && !secondaryCategory && !amount) return;
    const rowErrors: string[] = [];
    if (!date) rowErrors.push('收款日期未填或格式不正确，正确格式：2026-04-23、2026/4/23，或 Excel 日期');
    if (!contractNo) rowErrors.push('合同编号未填，收入必须和 ERP 或“合同项目导入”页中的合同编号一致');
    if (!stage) rowErrors.push('收款阶段未填，对应 ERP 新增收款里的收款阶段');
    if (!['是', '否'].includes(includeInPlanText)) rowErrors.push('是否进入合同收款计划必须填“是”或“否”');
    if (!primaryCategory) rowErrors.push('一级分类未填，必须使用 ERP 收支类别管理里的收入一级分类');
    if (!secondaryCategory) rowErrors.push('二级分类未填，必须使用 ERP 收支类别管理里的收入二级分类');
    if (!isValidMoney(row['收款金额'])) rowErrors.push('收款金额未填或格式不正确，必须是大于 0 的数字，例如：1000、12347.50');
    if (rowErrors.length > 0) {
      errors.push(`${INCOME_SHEET}第 ${index + 2} 行：${rowErrors.join('；')}`);
      return;
    }

    let contract = workingContracts.get(contractNo);
    if (!contract) {
      errors.push(`${INCOME_SHEET}第 ${index + 2} 行合同编号 ${contractNo} 在 ERP 和模板中都不存在`);
      return;
    }
    if (contract.houseAddress && projectName && contract.houseAddress !== projectName) {
      warnings.push(`${INCOME_SHEET}第 ${index + 2} 行项目名称与合同项目不完全一致：${projectName}`);
    }

    const remark = trimValue(row['备注']);
    const key = `${contractNo}|${date}|${amount}|${stage}|${remark}`;
    if (templateKeys.has(key)) {
      errors.push(`${INCOME_SHEET}第 ${index + 2} 行与模板内其他收入重复`);
      return;
    }
    templateKeys.add(key);
    if (existingKeys.has(key)) {
      warnings.push(`${INCOME_SHEET}第 ${index + 2} 行疑似重复，已跳过`);
      return;
    }

    const categoryPath = strictCategoryPath(incomeCategories, primaryCategory, secondaryCategory);
    if (!categoryPath) {
      const actualPrimary = categoryExistsElsewhere(incomeCategories, secondaryCategory);
      const tip = actualPrimary
        ? `二级分类“${secondaryCategory}”存在于收入一级分类“${actualPrimary.name}”下，请修正一级分类`
        : `分类“${primaryCategory} / ${secondaryCategory}”不存在，请先到收支类别管理的“收入类别”中新增后再导入`;
      errors.push(`${INCOME_SHEET}第 ${index + 2} 行：${tip}`);
      return;
    }

    const includeInPlan = includeInPlanText === '是';
    const existingStageIndex = contract.paymentStages.findIndex((item) => item.name === stage);
    if (includeInPlan) {
      if (existingStageIndex < 0 && !isValidMoney(row['阶段应收金额'])) {
        errors.push(`${INCOME_SHEET}第 ${index + 2} 行：合同 ${contractNo} 中不存在收款阶段“${stage}”，填“是”时阶段应收金额必须是大于 0 的数字`);
        return;
      }
      if (existingStageIndex < 0) {
        contract = {
          ...contract,
          paymentStages: [
            ...contract.paymentStages,
            { name: stage, amount: stagePlanAmount, ratio: contract.contractAmount > 0 ? stagePlanAmount / contract.contractAmount : 0 },
          ],
        };
        workingContracts.set(contractNo, contract);
        contractUpdates.set(contractNo, contract);
        warnings.push(`${INCOME_SHEET}第 ${index + 2} 行：将“${stage}”追加到合同 ${contractNo} 的收款计划，原阶段保留`);
      } else {
        const currentStage = contract.paymentStages[existingStageIndex];
        if ((currentStage.amount || 0) <= 0 && stagePlanAmount > 0) {
          const nextStages = contract.paymentStages.map((item, itemIndex) => itemIndex === existingStageIndex
            ? { ...item, amount: stagePlanAmount, ratio: contract.contractAmount > 0 ? stagePlanAmount / contract.contractAmount : 0 }
            : item);
          contract = { ...contract, paymentStages: nextStages };
          workingContracts.set(contractNo, contract);
          contractUpdates.set(contractNo, contract);
        } else if (stagePlanAmount > 0 && Math.abs(stagePlanAmount - (currentStage.amount || 0)) > 0.01) {
          warnings.push(`${INCOME_SHEET}第 ${index + 2} 行：合同 ${contractNo} 已有阶段“${stage}”及应收金额 ${currentStage.amount}，模板中的 ${stagePlanAmount} 不会覆盖原金额`);
        }
      }
    } else if (existingStageIndex >= 0) {
      errors.push(`${INCOME_SHEET}第 ${index + 2} 行：自定义阶段“${stage}”与合同 ${contractNo} 的已有收款阶段同名，请填“是”或更换名称`);
      return;
    }

    parsedReceipts.push({
      id: generateId(),
      contractId: contract.id,
      contractNo,
      bizType: currentBizType,
      customerName: contract.customerName,
      amount,
      paymentMethod: trimValue(row['收款方式']),
      receiptDate: date,
      stage,
      stageType: includeInPlan ? 'contract' : 'custom',
      ...expenseCategoryPayload(categoryPath),
      remark,
      attachments: [],
      lifecycleStatus: 'active',
      createdAt: new Date().toISOString(),
      createdBy: userName,
    });
  });

  return { parsedReceipts, contractUpdates };
}

function parseExpenseRows(
  rows: ImportRow[],
  currentBizType: BizType,
  availableContracts: Map<string, Contract>,
  expenses: Expense[],
  expenseCategories: ExpenseCategory[],
  userName: string,
  errors: string[],
  warnings: string[],
) {
  const parsedExpenses: Expense[] = [];
  const templateKeys = new Set<string>();
  const existingKeys = new Set(expenses.map((item) => `${item.contractNo || ''}|${item.expenseDate}|${item.amount}|${item.category}|${item.supplier}|${item.remark}`));

  rows.forEach((row, index) => {
    const contractNo = trimValue(row['合同编号']);
    const projectName = currentBizType === '工装' ? rowValue(row, ['项目名称', '归属项目']) : rowValue(row, ['归属项目', '项目名称']);
    const date = dateValue(row['支出日期']);
    const primaryCategory = trimValue(row['一级分类']);
    const secondaryCategory = trimValue(row['二级分类']);
    const amount = numberValue(row['支出金额']);
    const supplier = trimValue(row['收款方']);
    const status = trimValue(row['支付状态']) || '已付';
    if (!contractNo && !projectName && !primaryCategory && !secondaryCategory && !amount && !supplier) return;
    const rowErrors: string[] = [];
    if (!date) rowErrors.push('支出日期未填或格式不正确，正确格式：2026-04-23、2026/4/23，或 Excel 日期');
    if (!primaryCategory) rowErrors.push('一级分类未填，必须使用 ERP 收支类别管理里的支出一级分类');
    if (!secondaryCategory) rowErrors.push('二级分类未填，必须使用 ERP 收支类别管理里的支出二级分类');
    if (!isValidMoney(row['支出金额'])) rowErrors.push('支出金额未填或格式不正确，必须是大于 0 的数字，例如：1000、12347.50');
    if (status && !validExpenseStatuses.has(status)) rowErrors.push(`支付状态“${status}”不正确，只能填：已付、未付`);
    if (rowErrors.length > 0) {
      errors.push(`${EXPENSE_SHEET}第 ${index + 2} 行：${rowErrors.join('；')}`);
      return;
    }

    const contract = contractNo ? availableContracts.get(contractNo) : undefined;
    if (contractNo && !contract) {
      errors.push(`${EXPENSE_SHEET}第 ${index + 2} 行合同编号 ${contractNo} 在 ERP 和模板中都不存在；如为非项目支出请留空合同编号`);
      return;
    }
    if (contract?.houseAddress && projectName && contract.houseAddress !== projectName) {
      warnings.push(`${EXPENSE_SHEET}第 ${index + 2} 行项目名称与合同项目不完全一致：${projectName}`);
    }

    const remark = trimValue(row['备注']);
    const categoryPath = strictCategoryPath(expenseCategories, primaryCategory, secondaryCategory);
    if (!categoryPath) {
      const actualPrimary = categoryExistsElsewhere(expenseCategories, secondaryCategory);
      const tip = actualPrimary
        ? `二级分类“${secondaryCategory}”存在于支出一级分类“${actualPrimary.name}”下，请修正一级分类`
        : `分类“${primaryCategory} / ${secondaryCategory}”不存在，请先到收支类别管理的“支出类别”中新增后再导入`;
      errors.push(`${EXPENSE_SHEET}第 ${index + 2} 行：${tip}`);
      return;
    }
    const category = categoryPath.secondaryName || secondaryCategory || primaryCategory;
    const key = `${contractNo}|${date}|${amount}|${category}|${supplier}|${remark}`;
    if (templateKeys.has(key)) {
      errors.push(`${EXPENSE_SHEET}第 ${index + 2} 行与模板内其他支出重复`);
      return;
    }
    templateKeys.add(key);
    if (existingKeys.has(key)) {
      warnings.push(`${EXPENSE_SHEET}第 ${index + 2} 行疑似重复，已跳过`);
      return;
    }

    parsedExpenses.push({
      id: generateId(),
      contractId: contract?.id || '__none__',
      contractNo: contract?.contractNo || '',
      bizType: currentBizType,
      category,
      ...expenseCategoryPayload(categoryPath),
      amount,
      supplier,
      payMethod: trimValue(row['支出方式']),
      expenseDate: date,
      status: status as Expense['status'],
      remark,
      attachments: [],
      lifecycleStatus: 'active',
      createdAt: new Date().toISOString(),
      createdBy: userName,
    });
  });

  return parsedExpenses;
}

export default function FinanceImportModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { contracts, receipts, expenses, addContract, updateContract, addReceipt, addExpense, _refreshSilent } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user } = useAuthStore();
  const { showAlert, showConfirm } = useDialogStore();
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [incomeCategories, setIncomeCategories] = useState<ExpenseCategory[]>(DEFAULT_INCOME_CATEGORIES);

  useEffect(() => {
    if (!open) return;
    loadExpenseCategories(currentBizType).then(setExpenseCategories).catch(() => setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES));
    loadIncomeCategories(currentBizType).then(setIncomeCategories).catch(() => setIncomeCategories(DEFAULT_INCOME_CATEGORIES));
  }, [currentBizType, open]);

  const existingContractNos = useMemo(
    () => new Set(contracts.map((contract) => contract.contractNo).filter(Boolean)),
    [contracts],
  );

  const downloadTemplate = async () => {
    const XLSXStyle = await import('xlsx-js-style');
    XLSXStyle.writeFile(
      buildTemplateWorkbook(XLSXStyle as typeof XLSX, expenseCategories, incomeCategories, currentBizType),
      `ERP_${currentBizType}_财务数据导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`,
      { cellStyles: true },
    );
  };

  const parseWorkbook = async (file: File) => {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const errors: string[] = [];
    const warnings: string[] = [];
    const contractRows = sheetRows(workbook, CONTRACT_SHEET);
    const incomeRows = sheetRows(workbook, INCOME_SHEET);
    const expenseRows = sheetRows(workbook, EXPENSE_SHEET);
    if (!workbook.Sheets[CONTRACT_SHEET]) errors.push(`缺少页签：${CONTRACT_SHEET}`);
    if (!workbook.Sheets[INCOME_SHEET]) errors.push(`缺少页签：${INCOME_SHEET}`);
    if (!workbook.Sheets[EXPENSE_SHEET]) errors.push(`缺少页签：${EXPENSE_SHEET}`);

    const contractHeaderGroups = currentBizType === '工装'
      ? [['合同编号'], ['项目名称', '归属项目'], ['甲方', '客户名称'], ['签约日期'], ['合同金额']]
      : requiredHomeContractHeaders.map((header) => [header]);
    missingHeaderGroups(contractRows, contractHeaderGroups).forEach((header) => errors.push(`${CONTRACT_SHEET}缺少表头：${header}`));
    missingHeaders(incomeRows, requiredIncomeHeaders).forEach((header) => errors.push(`${INCOME_SHEET}缺少表头：${header}`));
    missingHeaders(expenseRows, requiredExpenseHeaders).forEach((header) => errors.push(`${EXPENSE_SHEET}缺少表头：${header}`));

    const userName = user?.name || 'ERP导入';
    const { contractMap, availableContracts } = parseContractRows(
      contractRows,
      currentBizType,
      existingContractNos,
      contracts,
      userName,
      errors,
      warnings,
    );
    const { parsedReceipts, contractUpdates } = parseIncomeRows(
      incomeRows,
      currentBizType,
      availableContracts,
      receipts,
      incomeCategories,
      userName,
      errors,
      warnings,
    );
    const parsedExpenses = parseExpenseRows(
      expenseRows,
      currentBizType,
      availableContracts,
      expenses,
      expenseCategories,
      userName,
      errors,
      warnings,
    );

    const contractsToAdd = Array.from(contractMap.entries()).map(([contractNo, contract]) => contractUpdates.get(contractNo) || contract);
    const existingContractUpdates = Array.from(contractUpdates.entries())
      .filter(([contractNo]) => existingContractNos.has(contractNo))
      .map(([, contract]) => contract);

    setSelectedFileName(file.name);
    setParsed({
      contracts: contractsToAdd,
      contractUpdates: existingContractUpdates,
      receipts: parsedReceipts,
      expenses: parsedExpenses,
      errors,
      warnings,
    });
  };

  const handleImport = async () => {
    if (!parsed) return;
    if (parsed.errors.length > 0) {
      await showAlert('当前模板还有错误项，请先修改后再导入。');
      return;
    }
    if (parsed.contracts.length + parsed.contractUpdates.length + parsed.receipts.length + parsed.expenses.length === 0) {
      await showAlert('没有可导入的数据，请检查模板内容。');
      return;
    }
    const confirmed = await showConfirm(
      `将导入 ${parsed.contracts.length} 个合同、更新 ${parsed.contractUpdates.length} 个合同收款计划、导入 ${parsed.receipts.length} 条收入、${parsed.expenses.length} 条支出。原合同收款阶段不会删除。`,
      { title: '确认批量导入财务数据？', confirmText: '确认导入' },
    );
    if (!confirmed) return;
    setImporting(true);
    try {
      for (const contract of parsed.contracts) await addContract(contract);
      for (const contract of parsed.contractUpdates) await updateContract(contract);
      for (const receipt of parsed.receipts) await addReceipt(receipt);
      for (const expense of parsed.expenses) await addExpense(expense);
      await _refreshSilent(['contracts', 'receipts', 'expenses'], true);
      await showAlert('导入完成，请到资金流水、收入管理、支出管理中核对金额。', { title: '导入成功' });
      setParsed(null);
      setSelectedFileName('');
      onClose();
    } catch (error: any) {
      await showAlert(error?.message || '导入失败，请检查网络或模板数据。', { title: '导入失败' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="财务数据导入" size="lg">
      <div className="space-y-4">
        <div className="rounded border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          请先下载系统模板，把历史合同、收入流水、支出流水迁移到对应页签后再上传。模板字段只保留 ERP 电脑端当前会保存和展示的字段；一二级分类必须已存在于 ERP，导入时不会自动新增分类。
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button type="button" onClick={downloadTemplate} className="erp-btn-secondary justify-center">
            <Download size={16} />
            下载导入模板
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="erp-btn-primary justify-center">
            <Upload size={16} />
            上传填写好的模板
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void parseWorkbook(file);
              event.currentTarget.value = '';
            }}
          />
        </div>

        {selectedFileName ? (
          <div className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet size={16} className="shrink-0 text-emerald-600" />
              <span className="truncate text-gray-700">{selectedFileName}</span>
            </div>
            <button type="button" onClick={() => { setParsed(null); setSelectedFileName(''); }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        ) : null}

        {parsed ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <ImportStat label="新增合同" value={parsed.contracts.length} />
              <ImportStat label="收入" value={parsed.receipts.length} />
              <ImportStat label="支出" value={parsed.expenses.length} />
            </div>
            {parsed.contractUpdates.length > 0 ? (
              <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                将更新 {parsed.contractUpdates.length} 个已有合同的收款计划，所有原阶段均会保留。
              </div>
            ) : null}
            {parsed.errors.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                {parsed.errors.slice(0, 50).map((error) => <div key={error}>{error}</div>)}
                {parsed.errors.length > 50 ? <div>还有 {parsed.errors.length - 50} 条错误未显示。</div> : null}
              </div>
            ) : null}
            {parsed.warnings.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                {parsed.warnings.slice(0, 50).map((warning) => <div key={warning}>{warning}</div>)}
                {parsed.warnings.length > 50 ? <div>还有 {parsed.warnings.length - 50} 条提示未显示。</div> : null}
              </div>
            ) : parsed.errors.length === 0 ? (
              <div className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                模板检查通过，未发现明显问题。
              </div>
            ) : null}
            {parsed.errors.length > 0 ? (
              <div className="rounded border border-red-100 bg-white px-3 py-2 text-xs text-red-600">
                有错误时系统不会写入数据，避免导入半截账。
              </div>
            ) : null}
            <button type="button" onClick={handleImport} disabled={importing || parsed.errors.length > 0} className="erp-btn-primary w-full justify-center disabled:opacity-50">
              {importing ? <Loader2 size={16} className="animate-spin" /> : null}
              {importing ? '导入中...' : '确认导入到 ERP'}
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-100 bg-white px-3 py-3 text-center">
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{label}</div>
    </div>
  );
}
