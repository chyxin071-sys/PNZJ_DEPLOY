import Dexie, { Table } from 'dexie';
import type { Contract, Receipt, Expense, Reimbursement, GeneralIncome, GeneralExpense, Notification, Quotation } from '@/types';

export interface UserRecord {
  _id?: string;
  id?: string;
  username?: string;
  account?: string;
  phone?: string;
  password?: string;
  passwordHash?: string;
  passwordPlain?: string;
  name?: string;
  role?: string;
  department?: string;
  bizTypes?: string[];
  joinDate?: string;
  status?: string;
  avatarUrl?: string;
  createdAt?: string;
  createTime?: string;
  [key: string]: any;
}

export class FinanceDB extends Dexie {
  contracts!: Table<Contract, string>;
  receipts!: Table<Receipt, string>;
  expenses!: Table<Expense, string>;
  reimbursements!: Table<Reimbursement, string>;
  generalIncomes!: Table<GeneralIncome, string>;
  generalExpenses!: Table<GeneralExpense, string>;
  users!: Table<UserRecord, string>;
  notifications!: Table<Notification, string>;
  quotations!: Table<Quotation, string>;

  constructor() {
    super('PinNuoFinanceDB');

    // v1 - 原始版本
    this.version(1).stores({
      contracts: 'id, contractNo, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
    });

    // v2 - 添加 communityName
    this.version(2).stores({
      contracts: 'id, contractNo, communityName, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
    });

    // v3 - 添加 general 表
    this.version(3).stores({
      contracts: 'id, contractNo, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
    });

    // v4 - 添加 users 表
    this.version(4).stores({
      contracts: 'id, contractNo, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
      users: 'id, username, role',
    });

    // v5 - houseAddress 索引，移除 communityName
    this.version(5).stores({
      contracts: 'id, contractNo, houseAddress, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
      users: 'id, username, role',
    });

    // v6 - 添加 notifications 表
    this.version(6).stores({
      contracts: 'id, contractNo, houseAddress, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
      users: 'id, username, role',
      notifications: 'id, targetUserId, isRead, createdAt',
    });

    // v7 - 添加报价表
    this.version(7).stores({
      contracts: 'id, contractNo, houseAddress, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, receiptDate',
      expenses: 'id, contractId, contractNo, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
      users: 'id, username, role',
      notifications: 'id, targetUserId, isRead, createdAt',
      quotations: 'id, contractId, contractNo, quotationDate',
    });

    // v8 - 添加 bizType 索引
    this.version(8).stores({
      contracts: 'id, contractNo, bizType, houseAddress, customerName, status, signDate',
      receipts: 'id, contractId, contractNo, bizType, receiptDate',
      expenses: 'id, contractId, contractNo, bizType, category, expenseDate',
      reimbursements: 'id, applicant, type, status, createdAt',
      generalIncomes: 'id, category, incomeDate',
      generalExpenses: 'id, category, expenseDate',
      users: 'id, username, role',
      notifications: 'id, targetUserId, isRead, createdAt',
      quotations: 'id, contractId, contractNo, bizType, quotationDate',
    });
  }
}

export const db = new FinanceDB();