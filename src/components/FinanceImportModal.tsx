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
  expenseCategoryPayload,
  loadExpenseCategories,
  resolveExpenseCategory,
  type ExpenseCategory,
} from '@/services/expenseCategories';
import { generateId } from '@/utils/format';
import type { Contract, Expense, Receipt } from '@/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

type ImportRow = Record<string, any>;

type ParsedImport = {
  contracts: Contract[];
  receipts: Receipt[];
  expenses: Expense[];
  errors: string[];
  warnings: string[];
};

const CONTRACT_SHEET = '合同项目导入';
const FLOW_SHEET = '流水导入';

const contractHeaders = [
  '合同编号',
  '归属项目',
  '客户名称',
  '客户电话',
  '合同名称',
  '签约日期',
  '合同金额',
  '项目地址',
  '合同状态',
  '负责人',
  '归属部门',
  '开工日期',
  '完工日期',
  '收款阶段1名称',
  '收款阶段1金额',
  '收款阶段2名称',
  '收款阶段2金额',
  '收款阶段3名称',
  '收款阶段3金额',
  '备注',
];

const flowHeaders = [
  '记账日期',
  '收支类型',
  '合同编号',
  '归属项目',
  '摘要/用途说明',
  '一级分类',
  '二级分类',
  '记账金额',
  '收支账户',
  '经手人',
  '归属部门',
  '对方单位',
  '货品/服务名称',
  '备注',
];

const requiredContractHeaders = ['合同编号', '归属项目', '客户名称', '签约日期', '合同金额'];
const requiredFlowHeaders = ['记账日期', '收支类型', '合同编号', '归属项目', '摘要/用途说明', '一级分类', '二级分类', '记账金额'];
const validFlowTypes = new Set(['收入', '支出']);
const validContractStatuses = new Set(['进行中', '已完工', '已结算']);
const DEFAULT_ACCOUNTS = ['银行账户', '现金', '微信', '支付宝', '对公账户'];
const ROLE_DEPT: Record<string, string> = {
  admin: '管理组',
  sales: '销售部',
  designer: '设计部',
  manager: '工程部',
  finance: '财务部',
  employee: '普通',
};

const trimValue = (value: unknown) => String(value ?? '').trim();

function numberValue(value: unknown) {
  if (typeof value === 'number') return value;
  const cleaned = trimValue(value).replace(/[,+￥¥\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
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
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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

function buildPaymentStages(row: ImportRow, amount: number) {
  const stages = [1, 2, 3].flatMap((index) => {
    const name = trimValue(row[`收款阶段${index}名称`]);
    const stageAmount = numberValue(row[`收款阶段${index}金额`]);
    if (!name && !stageAmount) return [];
    if (!name || !stageAmount) return [];
    return [{ name, amount: stageAmount, ratio: amount > 0 ? stageAmount / amount : 0 }];
  });
  return stages.length > 0 ? stages : [{ name: '合同款', amount, ratio: 1 }];
}

function uniqueValues(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => trimValue(value)).filter(Boolean)));
}

function getEmployeeDepartment(employee: any) {
  return trimValue(employee?.department) || ROLE_DEPT[String(employee?.role || '')] || '';
}

function getDepartments(users: any[], currentUser: any) {
  const departments = uniqueValues([
    currentUser?.department,
    ...users.map(getEmployeeDepartment),
    '财务部',
    '销售部',
    '设计部',
    '工程部',
    '管理组',
  ]);
  return departments;
}

function getCategoryRows(categories: ExpenseCategory[]) {
  return categories.flatMap((category) => category.children.map((child) => [category.name, child.name]));
}

function getImportCategoryOptionRows(categories: ExpenseCategory[]) {
  const incomeRows = [
    ['工程款项', '合同款'],
    ['工程款项', '定金'],
    ['工程款项', '中期款'],
    ['工程款项', '尾款'],
  ];
  return [...incomeRows, ...getCategoryRows(categories)];
}

function applyWorksheetBasics(sheet: XLSX.WorkSheet, headerCount: number, sampleRows: number[] = []) {
  sheet['!cols'] = Array.from({ length: headerCount }, () => ({ wch: 16 }));
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '166534' } },
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

function buildTemplateWorkbook(excel: typeof XLSX, categories: ExpenseCategory[], departments: string[]) {
  const workbook = excel.utils.book_new();

  const flowGuide = [
    ['步骤', '要做什么', '说明'],
    ['1', '下载模板', '请先下载本模板，不要自行改表头。'],
    ['2', '整理合同/项目', 'ERP 中不存在的历史合同，先填到“合同项目导入”。'],
    ['3', '整理流水', '每笔流水必须填写合同编号和归属项目。'],
    ['4', '上传导入', '系统会先导入合同，再导入收入/支出流水。'],
  ];
  excel.utils.book_append_sheet(workbook, excel.utils.aoa_to_sheet(flowGuide), '导入流程');

  const contractRows = [
    contractHeaders,
    ['示例-导入前删除', '核城家园2区3-1-502', '马金莲', '13800000000', '核城家园2区3-1-502装修合同', '2024-01-15', 58000, '核城家园2区3-1-502', '进行中', '张三', departments[0] || '工程部', '2024-01-20', '', '定金', 10000, '中期款', 28000, '尾款', 20000, '示例行，正式导入前请整行删除'],
  ];
  const contractSheet = excel.utils.aoa_to_sheet(contractRows);
  applyWorksheetBasics(contractSheet, contractHeaders.length, [1]);
  excel.utils.book_append_sheet(workbook, contractSheet, CONTRACT_SHEET);

  const categoryRows = getCategoryRows(categories);
  const optionCategoryRows = getImportCategoryOptionRows(categories);
  const firstCategory = categoryRows[0] || ['材料费', '主材采购'];
  const flowRows = [
    flowHeaders,
    ['2024-01-21', '收入', '示例-导入前删除', '核城家园2区3-1-502', '定金收款', '工程款项', '定金', 1000, DEFAULT_ACCOUNTS[0], '张三', departments[0] || '财务部', '马金莲', '', '示例行，正式导入前请整行删除'],
    ['2024-02-28', '支出', '示例-导入前删除', '核城家园2区3-1-502', '项目支出示例', firstCategory[0], firstCategory[1], 12347, DEFAULT_ACCOUNTS[0], '李四', departments[0] || '财务部', '供应商A', firstCategory[1], '示例行，正式导入前请整行删除'],
  ];
  const flowSheet = excel.utils.aoa_to_sheet(flowRows);
  applyWorksheetBasics(flowSheet, flowHeaders.length, [1, 2]);
  excel.utils.book_append_sheet(workbook, flowSheet, FLOW_SHEET);

  const optionLength = Math.max(optionCategoryRows.length, DEFAULT_ACCOUNTS.length, departments.length, validContractStatuses.size);
  const statuses = Array.from(validContractStatuses);
  const options = Array.from({ length: optionLength }, (_, index) => [
    optionCategoryRows[index]?.[0] || '',
    optionCategoryRows[index]?.[1] || '',
    DEFAULT_ACCOUNTS[index] || '',
    departments[index] || '',
    statuses[index] || '',
  ]);
  const optionSheet = excel.utils.aoa_to_sheet([
    ['一级分类', '二级分类', '收支账户', '归属部门', '合同状态'],
    ...options,
  ]);
  applyWorksheetBasics(optionSheet, 5);
  excel.utils.book_append_sheet(workbook, optionSheet, '下拉选项');

  const fieldGuide = [
    ['字段', '是否必填', '规则'],
    ['合同编号', '必填', '必须唯一；流水通过合同编号关联项目。'],
    ['归属项目', '必填', '合同页和流水页应保持一致。'],
    ['记账金额/合同金额', '必填', '必须是大于 0 的数字，不要填正负号。'],
    ['记账日期/签约日期', '必填', '统一 yyyy-mm-dd。'],
    ['收支类型', '必填', '只能填“收入”或“支出”。'],
    ['合同状态', '选填', '必须使用 ERP 合同状态：进行中、已完工、已结算。'],
    ['一级分类', '必填', '收入建议填“工程款项”；支出填 ERP 支出类别管理里的一级分类。'],
    ['二级分类', '必填', '收入填合同收款阶段，如合同款/定金/中期款/尾款；支出填 ERP 支出类别管理里的二级分类。'],
    ['示例行', '导入前删除', '红色字体为示例数据，正式导入前请整行删除。'],
  ];
  const fieldGuideSheet = excel.utils.aoa_to_sheet(fieldGuide);
  applyWorksheetBasics(fieldGuideSheet, 3);
  excel.utils.book_append_sheet(workbook, fieldGuideSheet, '字段说明');

  return workbook;
}

export default function FinanceImportModal({ open, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { contracts, receipts, expenses, addContract, addReceipt, addExpense, _refreshSilent } = useFinanceStore();
  const { currentBizType } = useBizStore();
  const { user, users, loadUsers } = useAuthStore();
  const { showAlert, showConfirm } = useDialogStore();
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(DEFAULT_EXPENSE_CATEGORIES);

  useEffect(() => {
    if (!open) return;
    loadExpenseCategories(currentBizType).then(setExpenseCategories).catch(() => setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES));
    if (users.length === 0) void loadUsers().catch(() => {});
  }, [currentBizType, loadUsers, open, users.length]);

  const existingContractNos = useMemo(
    () => new Set(contracts.map((contract) => contract.contractNo).filter(Boolean)),
    [contracts],
  );
  const departments = useMemo(() => getDepartments(users, user), [user, users]);

  const downloadTemplate = async () => {
    const XLSXStyle = await import('xlsx-js-style');
    XLSXStyle.writeFile(
      buildTemplateWorkbook(XLSXStyle as typeof XLSX, expenseCategories, departments),
      `ERP财务数据导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`,
      { cellStyles: true },
    );
  };

  const parseWorkbook = async (file: File) => {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const errors: string[] = [];
    const warnings: string[] = [];
    const contractRows = sheetRows(workbook, CONTRACT_SHEET);
    const flowRows = sheetRows(workbook, FLOW_SHEET);
    if (!workbook.Sheets[CONTRACT_SHEET]) errors.push(`缺少页签：${CONTRACT_SHEET}`);
    if (!workbook.Sheets[FLOW_SHEET]) errors.push(`缺少页签：${FLOW_SHEET}`);
    missingHeaders(contractRows, requiredContractHeaders).forEach((header) => errors.push(`合同项目导入缺少表头：${header}`));
    missingHeaders(flowRows, requiredFlowHeaders).forEach((header) => errors.push(`流水导入缺少表头：${header}`));

    const contractMap = new Map<string, Contract>();
    const templateContractNos = new Set<string>();
    const now = new Date().toISOString();

    contractRows.forEach((row, index) => {
      const contractNo = trimValue(row['合同编号']);
      const projectName = trimValue(row['归属项目']);
      const customerName = trimValue(row['客户名称']);
      const amount = numberValue(row['合同金额']);
      const signDate = dateValue(row['签约日期']);
      const status = trimValue(row['合同状态']) || '进行中';
      if (!contractNo && !projectName && !customerName) return;
      if (!contractNo || !projectName || !customerName || !amount || !signDate) {
        errors.push(`合同项目导入第 ${index + 2} 行缺少必填字段或金额/日期格式不正确`);
        return;
      }
      if (templateContractNos.has(contractNo)) {
        errors.push(`合同项目导入第 ${index + 2} 行合同编号重复：${contractNo}`);
        return;
      }
      templateContractNos.add(contractNo);
      if (!validContractStatuses.has(status)) {
        errors.push(`合同项目导入第 ${index + 2} 行合同状态“${status}”不在 ERP 状态中，只能填：进行中、已完工、已结算`);
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
        customerPhone: trimValue(row['客户电话']),
        contractAmount: amount,
        paymentStages: buildPaymentStages(row, amount),
        status: status as Contract['status'],
        signDate,
        expectedEndDate: dateValue(row['完工日期']),
        projectManager: trimValue(row['负责人']),
        remark: trimValue(row['备注']),
        attachments: [],
        createdAt: now,
        createdBy: user?.name || 'ERP导入',
      });
    });

    const availableContracts = new Map<string, Contract>();
    contracts.forEach((contract) => availableContracts.set(contract.contractNo, contract));
    contractMap.forEach((contract) => availableContracts.set(contract.contractNo, contract));

    const parsedReceipts: Receipt[] = [];
    const parsedExpenses: Expense[] = [];
    const templateFlowKeys = new Set<string>();
    const existingFlowKeys = new Set([
      ...receipts.map((item) => `收入|${item.contractNo}|${item.receiptDate}|${item.amount}|${item.stage}|${item.remark}`),
      ...expenses.map((item) => `支出|${item.contractNo}|${item.expenseDate}|${item.amount}|${item.category}|${item.remark}`),
    ]);

    flowRows.forEach((row, index) => {
      const type = trimValue(row['收支类型']);
      const contractNo = trimValue(row['合同编号']);
      const projectName = trimValue(row['归属项目']);
      const date = dateValue(row['记账日期']);
      const amount = numberValue(row['记账金额']);
      const summary = trimValue(row['摘要/用途说明']);
      if (!type && !contractNo && !projectName && !summary) return;
      if (!date || !type || !contractNo || !projectName || !summary || !amount) {
        errors.push(`流水导入第 ${index + 2} 行缺少必填字段或金额/日期格式不正确`);
        return;
      }
      if (!validFlowTypes.has(type)) {
        errors.push(`流水导入第 ${index + 2} 行收支类型只能填写“收入”或“支出”`);
        return;
      }
      const contract = availableContracts.get(contractNo);
      if (!contract) {
        errors.push(`流水导入第 ${index + 2} 行合同编号 ${contractNo} 在 ERP 和模板中都不存在`);
        return;
      }
      if (contract.houseAddress && projectName && contract.houseAddress !== projectName) {
        warnings.push(`流水导入第 ${index + 2} 行归属项目与合同项目不完全一致：${projectName}`);
      }
      const secondaryCategory = trimValue(row['二级分类']);
      const primaryCategory = trimValue(row['一级分类']);
      const remark = trimValue(row['备注']) || summary;
      const flowKey = `${type}|${contractNo}|${date}|${amount}|${secondaryCategory || summary}|${remark}`;
      if (templateFlowKeys.has(flowKey)) {
        errors.push(`流水导入第 ${index + 2} 行与模板内其他流水重复`);
        return;
      }
      templateFlowKeys.add(flowKey);
      if (existingFlowKeys.has(flowKey)) {
        warnings.push(`流水导入第 ${index + 2} 行疑似重复，已跳过`);
        return;
      }
      if (type === '收入') {
        if (!contract.paymentStages.some((stage) => stage.name === secondaryCategory)) {
          warnings.push(`流水导入第 ${index + 2} 行收入阶段“${secondaryCategory}”不在合同收款阶段中`);
        }
        parsedReceipts.push({
          id: generateId(),
          contractId: contract.id,
          contractNo,
          bizType: currentBizType,
          customerName: trimValue(row['对方单位']) || contract.customerName,
          amount,
          paymentMethod: trimValue(row['收支账户']) || '银行账户',
          receiptDate: date,
          stage: secondaryCategory || summary,
          remark,
          attachments: [],
          lifecycleStatus: 'active',
          createdAt: now,
          createdBy: user?.name || 'ERP导入',
        });
      } else {
        const categoryPath = resolveExpenseCategory({
          primaryCategory,
          secondaryCategory,
          category: secondaryCategory,
        }, expenseCategories);
        if (primaryCategory && categoryPath.primaryName && primaryCategory !== categoryPath.primaryName) {
          warnings.push(`流水导入第 ${index + 2} 行一级分类“${primaryCategory}”与 ERP 分类不完全匹配，导入后归到“${categoryPath.primaryName} / ${categoryPath.secondaryName}”`);
        }
        if (secondaryCategory && categoryPath.secondaryName && secondaryCategory !== categoryPath.secondaryName) {
          warnings.push(`流水导入第 ${index + 2} 行二级分类“${secondaryCategory}”与 ERP 分类不完全匹配，导入后归到“${categoryPath.primaryName} / ${categoryPath.secondaryName}”`);
        }
        parsedExpenses.push({
          id: generateId(),
          contractId: contract.id,
          contractNo,
          bizType: currentBizType,
          category: categoryPath.secondaryName || secondaryCategory || primaryCategory || summary,
          ...expenseCategoryPayload(categoryPath),
          amount,
          supplier: trimValue(row['对方单位']) || trimValue(row['货品/服务名称']) || projectName,
          payMethod: trimValue(row['收支账户']) || '银行账户',
          expenseDate: date,
          status: '已付',
          remark,
          attachments: [],
          lifecycleStatus: 'active',
          createdAt: now,
          createdBy: user?.name || 'ERP导入',
        });
      }
    });

    setSelectedFileName(file.name);
    setParsed({
      contracts: Array.from(contractMap.values()),
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
    if (parsed.contracts.length + parsed.receipts.length + parsed.expenses.length === 0) {
      await showAlert('没有可导入的数据，请检查模板内容。');
      return;
    }
    const confirmed = await showConfirm(
      `将导入 ${parsed.contracts.length} 个合同、${parsed.receipts.length} 条收入、${parsed.expenses.length} 条支出。导入前请确认已经备份原始 Excel。`,
      { title: '确认批量导入财务数据？', confirmText: '确认导入' },
    );
    if (!confirmed) return;
    setImporting(true);
    try {
      for (const contract of parsed.contracts) await addContract(contract);
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
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          请先下载系统模板，把历史合同和流水迁移到模板后再上传。系统会先导入合同项目，再按合同编号导入收入和支出流水。
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
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
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
              <ImportStat label="合同" value={parsed.contracts.length} />
              <ImportStat label="收入" value={parsed.receipts.length} />
              <ImportStat label="支出" value={parsed.expenses.length} />
            </div>
            {parsed.errors.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                {parsed.errors.slice(0, 50).map((error) => <div key={error}>{error}</div>)}
                {parsed.errors.length > 50 ? <div>还有 {parsed.errors.length - 50} 条错误未显示。</div> : null}
              </div>
            ) : null}
            {parsed.warnings.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                {parsed.warnings.slice(0, 50).map((warning) => <div key={warning}>{warning}</div>)}
                {parsed.warnings.length > 50 ? <div>还有 {parsed.warnings.length - 50} 条提示未显示。</div> : null}
              </div>
            ) : parsed.errors.length === 0 ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                模板检查通过，未发现明显问题。
              </div>
            ) : null}
            {parsed.errors.length > 0 ? (
              <div className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs text-red-600">
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
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-3 text-center">
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{label}</div>
    </div>
  );
}
