import type { ReactNode } from 'react';

export type BizType = '家装' | '工装';

export interface Column<T = any> {
  key: string;
  title: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  truncate?: boolean;
  hideOn?: 'md' | 'lg';
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface FileAttachment {
  fileID: string;
  name: string;
  size?: number;
  sizeStr?: string;
  type?: string;
  uploader?: string;
  uploadTime?: string;
}

export type AttachmentValue = string | FileAttachment;

// 合同
export interface Contract {
  _id?: string;
  id: string;
  customerId?: string; // 关联的客户ID
  customerNo?: string; // 客户编号，家装合同编号默认沿用该编号
  contractNo: string;
  bizType: BizType;
  houseAddress: string;     // 项目地址（小区名称+楼号房号）
  customerName: string;
  customerPhone: string;
  partyB?: string;
  partyC?: string;
  contractAmount: number;
  paymentStages: PaymentStage[];
  status: '进行中' | '已完工' | '已结算';
  signDate: string;
  expectedEndDate: string;
  projectManager: string;
  sales?: string;       // 销售，多个用顿号分隔（家装从客户同步）
  designer?: string;    // 设计师，多个用顿号分隔（家装从客户同步）
  remark: string;
  attachments?: AttachmentValue[];
  createdAt: string;
  createdBy?: string;   // 录入人姓名，用于权限过滤（可选，兼容存量数据）
}

export interface PaymentStage {
  name: string;
  amount: number;
  ratio: number;
}

// 收款记录
export interface Receipt {
  _id?: string;
  id: string;
  contractId: string;
  contractNo: string;
  bizType: BizType;
  customerName: string;
  amount: number;
  paymentMethod: string;
  receiptDate: string;
  stage: string;
  remark: string;
  attachments: AttachmentValue[];
  createdAt: string;
  createdBy?: string;   // 录入人姓名，用于权限过滤（可选，兼容存量数据）
}

// 支出记录
export interface Expense {
  _id?: string;
  id: string;
  contractId: string;
  contractNo: string;
  bizType: BizType;
  category: string;
  primaryCategoryId?: string;
  primaryCategory?: string;
  secondaryCategoryId?: string;
  secondaryCategory?: string;
  amount: number;
  supplier: string;
  payMethod: string;
  expenseDate: string;
  status: '已付' | '未付';
  remark: string;
  attachments: AttachmentValue[];
  createdAt: string;
  createdBy?: string;   // 录入人姓名，用于权限过滤（可选，兼容存量数据）
}

// 开票记录
export interface InvoiceRecord {
  _id?: string;
  id: string;
  contractId: string;
  contractNo: string;
  bizType: BizType;
  invoiceUnit: string;
  invoiceDate: string;
  invoiceAmount: number;
  paymentDate: string;
  paymentAmount: number;
  debtAmount: number;
  remark: string;
  attachments: AttachmentValue[];
  createdAt: string;
  createdBy?: string;
}

// 报销记录
export interface Reimbursement {
  _id?: string;
  id: string;
  contractId?: string; // 关联的合同ID（可选，非项目报销则为空）
  applicant: string;
  department: string;
  type: string;
  amount: number;
  expenseDate: string;
  description: string;
  attachments: AttachmentValue[];
  status: '待一级审批' | '待二级审批' | '待打款' | '待审核' | '已审核' | '已打款' | '已驳回';
  approvalFlow?: {
    approver1Ids?: string[];
    approver2Ids?: string[];
    ccUserIds?: string[];
    payerIds?: string[];
  };
  approvalRecords?: Array<{
    level?: number;
    action: string;
    operatorId?: string;
    operatorName?: string;
    comment?: string;
    operatedAt: string;
  }>;
  firstReviewer?: string;
  firstReviewDate?: string;
  secondReviewer?: string;
  secondReviewDate?: string;
  payerId?: string;
  payerName?: string;
  reviewComment: string;
  reviewer: string;
  reviewDate: string;
  paymentVoucher: string;
  paymentDate: string;
  createdAt: string;
}

// 总店收入（非项目收入）
export interface GeneralIncome {
  _id?: string;
  id: string;
  bizType?: BizType;
  category: '设计费' | '管理费' | '其他收入';
  amount: number;
  source: string;
  incomeDate: string;
  remark: string;
  createdAt: string;
}

// 总店支出（房租/水电/行政等）
export interface GeneralExpense {
  _id?: string;
  id: string;
  bizType?: BizType;
  category: '房租' | '水电物业' | '行政工资' | '办公用品' | '营销推广' | '交通物流' | '其他';
  amount: number;
  payee: string;
  expenseDate: string;
  remark: string;
  createdAt: string;
}

// 财务统计
export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalReceivable: number;
  monthlyData: MonthlyData[];
  contractCount: number;
}

export interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

export interface ProjectProfit {
  id: string;
  contractNo: string;
  houseAddress: string;
  customerName: string;
  contractAmount: number;
  receivedAmount: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
}

// 报价记录
export interface QuotationData {
  basicWorks: BasicWorkItem[];
  doors: DoorItem[];
  mainMaterials: MainMaterialItem[];
  customFurnitures: CustomFurnitureItem[];
  personalizedWorks: PersonalizedWorkItem[];
  otherWorks: PersonalizedWorkItem[];
  excludedItems: string[];
  commercialWorks?: CommercialWorkItem[];
}

export interface CommercialWorkItem {
  id: string;
  category: string;
  projectName: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export interface BasicWorkItem {
  id: string;
  space: string;
  name: string;
  description: string;
  unit: string;
  quantity: string | number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export interface DoorItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export interface MainMaterialItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string;
}

export interface CustomFurnitureItem {
  id: string;
  space: string;
  name: string;
  area: number;
  unit: string;
  unitPrice: number;
  amount: number;
  cabinetMaterial: string;
  doorMaterial: string;
  remark: string;
}

export interface PersonalizedWorkItem {
  id: string;
  projectNo: string;
  projectName: string;
  materialName: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  materialAmount: number;
  laborUnitPrice: number;
  laborAmount: number;
  totalAmount: number;
}

export interface Quotation {
  _id?: string;
  id: string;
  contractId?: string;
  contractNo?: string;
  leadId?: string;
  customerName?: string;
  customerPhone?: string;
  houseAddress?: string;
  bizType: BizType;
  version: string;
  amount: number;
  content: string;
  detailedData?: QuotationData;
  attachments: AttachmentValue[];
  status: '草稿' | '已发送' | '已确认' | '已作废';
  quotationDate: string;
  createdAt: string;
}

// 站内信通知
export interface Notification {
  id: string;
  title: string;
  content: string;
  type: '报销' | '系统' | '审核';
  category?: string;
  relatedTo?: { type: string; id: string; name: string };
  isRead: boolean;
  targetUserId: string;
  recipientUserIds?: string[];
  createdAt: string;
}

// 项目日志
export interface ProjectLog {
  id: string;
  projectId: string; // 关联的工地(Project) ID
  stage: string;     // 相关阶段，如：水电、瓦工、木工等
  content: string;   // 日志内容
  photos: AttachmentValue[]; // 现场照片
  visibleToCustomer: boolean; // 是否对客户可见
  creatorName: string; // 创建人姓名
  createdAt: string; // 创建时间
}

// 工地巡检
export interface ProjectInspection {
  id: string;
  projectId: string; // 关联的工地(Project) ID
  title: string;     // 巡检标题或简述
  status: '合格' | '需整改' | '整改待验收' | '整改通过'; // 巡检状态
  inspectorName: string; // 巡检人姓名（管理员/上级）
  inspectorId?: string; // 巡检创建人ID
  createdBy?: string; // 兼容旧数据中的创建人ID
  description: string;   // 巡检情况说明
  photos: AttachmentValue[]; // 巡检照片
  
  // 整改相关字段
  rectifyManagerName?: string; // 负责整改的项目经理
  rectifyDescription?: string; // 整改说明
  rectifyPhotos?: AttachmentValue[]; // 整改后的照片
  rectifySubmittedAt?: string; // 提交整改的时间
  
  createdAt: string; // 巡检创建时间
}
