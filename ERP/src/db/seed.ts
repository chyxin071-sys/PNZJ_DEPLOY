import {
  contractsAPI, receiptsAPI, expensesAPI, reimbursementsAPI,
  generalIncomesAPI, generalExpensesAPI, quotationsAPI, usersAPI,
} from './api';
import type { Contract, Receipt, Expense, Reimbursement, GeneralIncome, GeneralExpense, PaymentStage, Quotation } from '@/types';
import dayjs from 'dayjs';

function id(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export async function seedDatabase() {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_SEED !== 'true') {
    return;
  }

  const count = await contractsAPI.count();
  if (count > 0) {
    const first = (await contractsAPI.limit(1))[0] || null;
    // 检测旧格式：PN前缀 或 缺少 bizType 字段
    if (first && !first.contractNo.startsWith('PN-') && (first as any).bizType !== undefined) return;
    // 旧格式，清除所有表
    await contractsAPI.clear();
    await receiptsAPI.clear();
    await expensesAPI.clear();
    await reimbursementsAPI.clear();
    await generalIncomesAPI.clear();
    await generalExpensesAPI.clear();
    await quotationsAPI.clear();
  }

  const now = dayjs();

  // ===== 家装合同 =====
  const homeContracts: Contract[] = [
    { id: id(), contractNo: '25001', bizType: '家装', houseAddress: '未来科技城翡翠湾 1-101', customerName: '张伟', customerPhone: '13800001001', contractAmount: 286000, paymentStages: makeStages(286000), status: '已结算', signDate: now.subtract(11, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(8, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '', createdAt: now.subtract(11, 'month').toISOString() },
    { id: id(), contractNo: '25002', bizType: '家装', houseAddress: '文三路华星时代广场 2-1503', customerName: '李娜', customerPhone: '13800001002', contractAmount: 158000, paymentStages: makeStages(158000), status: '已完工', signDate: now.subtract(10, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(7, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '', createdAt: now.subtract(10, 'month').toISOString() },
    { id: id(), contractNo: '25003', bizType: '家装', houseAddress: '江南大道星光大道 3-802', customerName: '王强', customerPhone: '13800001003', contractAmount: 420000, paymentStages: makeStages(420000), status: '进行中', signDate: now.subtract(8, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(1, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '', createdAt: now.subtract(8, 'month').toISOString() },
    { id: id(), contractNo: '25004', bizType: '家装', houseAddress: '大运河府 5-301', customerName: '赵敏', customerPhone: '13800001004', contractAmount: 520000, paymentStages: makeStages(520000), status: '进行中', signDate: now.subtract(7, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(2, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '含全屋定制', createdAt: now.subtract(7, 'month').toISOString() },
    { id: id(), contractNo: '25005', bizType: '家装', houseAddress: '钱江世纪城奥体中心 6-1201', customerName: '孙磊', customerPhone: '13800001005', contractAmount: 365000, paymentStages: makeStages(365000), status: '已结算', signDate: now.subtract(9, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(5, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '', createdAt: now.subtract(9, 'month').toISOString() },
    { id: id(), contractNo: '25006', bizType: '家装', houseAddress: '钱江新城万象城 7-2201', customerName: '周杰', customerPhone: '13800001006', contractAmount: 680000, paymentStages: makeStages(680000), status: '进行中', signDate: now.subtract(5, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(3, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '豪华精装', createdAt: now.subtract(5, 'month').toISOString() },
    { id: id(), contractNo: '25007', bizType: '家装', houseAddress: '理想银泰城 8-503', customerName: '吴芳', customerPhone: '13800001007', contractAmount: 195000, paymentStages: makeStages(195000), status: '已完工', signDate: now.subtract(6, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(2, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '', createdAt: now.subtract(6, 'month').toISOString() },
    { id: id(), contractNo: '25008', bizType: '家装', houseAddress: '银湖科技城 9-1602', customerName: '郑涛', customerPhone: '13800001008', contractAmount: 238000, paymentStages: makeStages(238000), status: '进行中', signDate: now.subtract(4, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(2, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '', createdAt: now.subtract(4, 'month').toISOString() },
    { id: id(), contractNo: '25009', bizType: '家装', houseAddress: '龙湖天街 10-1101', customerName: '陈雪', customerPhone: '13800001009', contractAmount: 310000, paymentStages: makeStages(310000), status: '已结算', signDate: now.subtract(10, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(6, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '', createdAt: now.subtract(10, 'month').toISOString() },
    { id: id(), contractNo: '25010', bizType: '家装', houseAddress: '青山湖玫瑰园 11-101', customerName: '刘洋', customerPhone: '13800001010', contractAmount: 750000, paymentStages: makeStages(750000), status: '进行中', signDate: now.subtract(3, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(4, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '别墅整装', createdAt: now.subtract(3, 'month').toISOString() },
    { id: id(), contractNo: '25011', bizType: '家装', houseAddress: '西溪湿地 12-402', customerName: '黄丽', customerPhone: '13800001011', contractAmount: 275000, paymentStages: makeStages(275000), status: '进行中', signDate: now.subtract(2, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(3, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '现代简约', createdAt: now.subtract(2, 'month').toISOString() },
    { id: id(), contractNo: '25012', bizType: '家装', houseAddress: '梦想小镇 13-703', customerName: '马超', customerPhone: '13800001012', contractAmount: 188000, paymentStages: makeStages(188000), status: '已完工', signDate: now.subtract(7, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(3, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '', createdAt: now.subtract(7, 'month').toISOString() },
    { id: id(), contractNo: '25013', bizType: '家装', houseAddress: '阿里巴巴园区 14-2501', customerName: '林峰', customerPhone: '13800001013', contractAmount: 455000, paymentStages: makeStages(455000), status: '进行中', signDate: now.subtract(1, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(5, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '新中式风格', createdAt: now.subtract(1, 'month').toISOString() },
    { id: id(), contractNo: '25014', bizType: '家装', houseAddress: '奥体印象城 15-1802', customerName: '何欢', customerPhone: '13800001014', contractAmount: 330000, paymentStages: makeStages(330000), status: '已结算', signDate: now.subtract(8, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(4, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '', createdAt: now.subtract(8, 'month').toISOString() },
    { id: id(), contractNo: '25015', bizType: '家装', houseAddress: '乐堤港 16-601', customerName: '罗敏', customerPhone: '13800001015', contractAmount: 265000, paymentStages: makeStages(265000), status: '进行中', signDate: now.subtract(2, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(3, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '', createdAt: now.subtract(2, 'month').toISOString() },
    { id: id(), contractNo: '26001', bizType: '家装', houseAddress: '湖滨银泰 17-3501', customerName: '梁宇', customerPhone: '13800001016', contractAmount: 890000, paymentStages: makeStages(890000), status: '进行中', signDate: now.format('YYYY-MM-DD'), expectedEndDate: now.add(6, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '顶楼复式精装', createdAt: now.toISOString() },
  ];

  // ===== 工装合同 =====
  const commercialContracts: Contract[] = [
    { id: id(), contractNo: 'G25001', bizType: '工装', houseAddress: '万象城购物中心 3F-301', customerName: '星巴克咖啡', customerPhone: '0571-88001001', contractAmount: 350000, paymentStages: makeStages(350000), status: '已结算', signDate: now.subtract(10, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(7, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '连锁咖啡店标准装修', createdAt: now.subtract(10, 'month').toISOString() },
    { id: id(), contractNo: 'G25002', bizType: '工装', houseAddress: '未来科技城创业园 A栋-12F', customerName: '云帆科技有限公司', customerPhone: '0571-88001002', contractAmount: 680000, paymentStages: makeStages(680000), status: '进行中', signDate: now.subtract(6, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(1, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '整层办公楼装修', createdAt: now.subtract(6, 'month').toISOString() },
    { id: id(), contractNo: 'G25003', bizType: '工装', houseAddress: '银泰百货湖滨店 2F-205', customerName: '耐克体育专卖店', customerPhone: '0571-88001003', contractAmount: 420000, paymentStages: makeStages(420000), status: '已完工', signDate: now.subtract(8, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(4, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '运动品牌旗舰店装修', createdAt: now.subtract(8, 'month').toISOString() },
    { id: id(), contractNo: 'G25004', bizType: '工装', houseAddress: '钱江国际中心 15F-1501', customerName: '恒信律师事务所', customerPhone: '0571-88001004', contractAmount: 520000, paymentStages: makeStages(520000), status: '进行中', signDate: now.subtract(4, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(2, 'month').format('YYYY-MM-DD'), projectManager: '陈工', remark: '律所办公室精装', createdAt: now.subtract(4, 'month').toISOString() },
    { id: id(), contractNo: 'G25005', bizType: '工装', houseAddress: '西溪龙湖天街 B1-08', customerName: '喜茶饮品店', customerPhone: '0571-88001005', contractAmount: 280000, paymentStages: makeStages(280000), status: '已结算', signDate: now.subtract(12, 'month').format('YYYY-MM-DD'), expectedEndDate: now.subtract(9, 'month').format('YYYY-MM-DD'), projectManager: '王工', remark: '茶饮门店标准化装修', createdAt: now.subtract(12, 'month').toISOString() },
    { id: id(), contractNo: 'G26001', bizType: '工装', houseAddress: '杭州东站枢纽商业区 2F-12', customerName: '肯德基餐饮', customerPhone: '0571-88001006', contractAmount: 950000, paymentStages: makeStages(950000), status: '进行中', signDate: now.subtract(1, 'month').format('YYYY-MM-DD'), expectedEndDate: now.add(3, 'month').format('YYYY-MM-DD'), projectManager: '刘工', remark: '高铁站餐饮门店装修', createdAt: now.subtract(1, 'month').toISOString() },
  ];

  const contracts = [...homeContracts, ...commercialContracts];
  await contractsAPI.bulkAdd(contracts);

  // ===== 报价记录 =====
  const quotations: Quotation[] = [];

  function addQuotation(contractNo: string, versions: { version: string; amount: number; content: string; status: Quotation['status']; dateOffset: number }[]) {
    const c = contracts.find((x) => x.contractNo === contractNo);
    if (!c) return;
    for (const v of versions) {
      quotations.push({
        id: id(),
        contractId: c.id,
        contractNo: c.contractNo,
        bizType: c.bizType,
        version: v.version,
        amount: v.amount,
        content: v.content,
        status: v.status,
        quotationDate: now.subtract(v.dateOffset, 'month').format('YYYY-MM-DD'),
        createdAt: now.subtract(v.dateOffset, 'month').toISOString(),
        attachments: [],
      });
    }
  }

  // 家装报价
  addQuotation('25001', [
    { version: '初版', amount: 280000, content: '全屋基础装修方案，含水电改造、墙地面处理、基础吊顶', status: '已作废', dateOffset: 10 },
    { version: '修订版V2', amount: 285000, content: '增加厨房定制橱柜、卫生间集成吊顶升级', status: '已作废', dateOffset: 9 },
    { version: '最终版', amount: 286000, content: '全屋装修（含水电、墙地面、吊顶、定制橱柜、集成吊顶），赠送全屋美缝', status: '已确认', dateOffset: 8 },
  ]);
  addQuotation('25002', [
    { version: '初版', amount: 150000, content: '简约现代风格装修方案，含基础水电、墙地面处理', status: '已作废', dateOffset: 9 },
    { version: '最终版', amount: 158000, content: '现代简约精装，增加客厅电视背景墙、卧室步入式衣柜', status: '已确认', dateOffset: 8 },
  ]);
  addQuotation('25003', [
    { version: '初版', amount: 400000, content: '大户型基础装修方案，含全屋水电、地暖铺设、中央空调管线预留', status: '已作废', dateOffset: 7 },
    { version: '修订版V2', amount: 415000, content: '增加书房定制书柜、阳台封闭改造、智能家居布线', status: '已作废', dateOffset: 6 },
    { version: '最终版', amount: 420000, content: '全套豪华装修，含地暖、中央空调管线、定制书柜、智能家居布线、阳台封闭', status: '已确认', dateOffset: 5 },
  ]);
  addQuotation('25004', [
    { version: '初版', amount: 500000, content: '全屋定制精装方案，含进口实木地板、全屋定制柜体', status: '已作废', dateOffset: 6 },
    { version: '最终版', amount: 520000, content: '豪华精装含全屋定制，增加进口大理石台面、品牌卫浴升级', status: '已确认', dateOffset: 5 },
  ]);
  addQuotation('25006', [
    { version: '初版', amount: 650000, content: '豪华精装方案，含全屋大理石地面、实木护墙板、进口厨卫', status: '已作废', dateOffset: 4 },
    { version: '修订版V2', amount: 670000, content: '增加全屋智能系统、中央新风系统、酒柜定制', status: '已作废', dateOffset: 3 },
    { version: '最终版', amount: 680000, content: '顶配豪华精装，含大理石地面、实木护墙板、进口厨卫、全屋智能、中央新风、定制酒柜', status: '已确认', dateOffset: 2 },
  ]);
  addQuotation('25010', [
    { version: '初版', amount: 700000, content: '别墅整装基础方案，含全屋结构改造、水电系统、中央空调、地暖铺设', status: '已作废', dateOffset: 2 },
    { version: '修订版V2', amount: 730000, content: '增加庭院景观设计、地下室影音室装修、全屋实木定制', status: '已作废', dateOffset: 1 },
    { version: '最终版', amount: 750000, content: '别墅全程整装，含结构改造、水电系统、中央空调、地暖、庭院景观、地下室影音室、全屋实木定制、智能安防', status: '已确认', dateOffset: 0 },
  ]);

  // 工装报价
  addQuotation('G25001', [
    { version: '初版', amount: 320000, content: '星巴克标准店面装修方案，含吧台区、客座区、后台操作间', status: '已作废', dateOffset: 11 },
    { version: '最终版', amount: 350000, content: '星巴克门店装修，含品牌标准吧台、定制家具、灯光系统、外立面招牌', status: '已确认', dateOffset: 10 },
  ]);
  addQuotation('G25002', [
    { version: '初版', amount: 620000, content: '办公楼整层基础装修，含隔断、强弱电布线、中央空调风道', status: '已作废', dateOffset: 7 },
    { version: '修订版V2', amount: 660000, content: '增加开放式办公区家具定制、会议室多媒体系统', status: '已作废', dateOffset: 6 },
    { version: '最终版', amount: 680000, content: '整层办公楼精装，含隔断、强弱电、空调、办公家具定制、会议室多媒体、茶水间', status: '已确认', dateOffset: 5 },
  ]);
  addQuotation('G25004', [
    { version: '初版', amount: 480000, content: '律所办公室装修方案，含独立办公室、会议室、接待区', status: '已作废', dateOffset: 5 },
    { version: '最终版', amount: 520000, content: '律所精装，含独立办公室实木装饰、会议室隔音处理、接待区品牌形象墙', status: '已确认', dateOffset: 4 },
  ]);
  addQuotation('G26001', [
    { version: '初版', amount: 880000, content: '肯德基高铁站标准门店方案，含厨房设备区、点餐区、用餐区', status: '已作废', dateOffset: 2 },
    { version: '修订版V2', amount: 920000, content: '增加品牌数字化点餐屏、儿童游乐区装修', status: '已作废', dateOffset: 1 },
    { version: '最终版', amount: 950000, content: '肯德基高铁站旗舰店，含厨房设备区、数字化点餐区、用餐区、儿童区、品牌外立面', status: '已确认', dateOffset: 0 },
  ]);
  await quotationsAPI.bulkAdd(quotations);

  // ===== 收款记录 =====
  const receipts: Receipt[] = [];
  const paymentMethods = ['银行转账', '微信支付', '支付宝', '现金'];
  const stages = ['一期款', '二期款', '三期款', '尾款', '增项款'];

  for (const c of contracts) {
    const stageCount = c.status === '已结算' ? c.paymentStages.length : Math.max(1, c.paymentStages.length - Math.floor(Math.random() * 2));
    for (let i = 0; i < stageCount; i++) {
      const stageAmount = c.paymentStages[i]?.amount || 0;
      const dateOffset = -Math.floor(Math.random() * 6) - i * 1;
      receipts.push({
        id: id(),
        contractId: c.id,
        contractNo: c.contractNo,
        bizType: c.bizType,
        customerName: c.customerName,
        amount: stageAmount,
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        receiptDate: now.subtract(Math.abs(dateOffset), 'month').format('YYYY-MM-DD'),
        stage: stages[i] || `${i + 1}期款`,
        remark: '',
        createdAt: now.subtract(Math.abs(dateOffset), 'month').toISOString(),
        attachments: [],
      });
    }
  }
  await receiptsAPI.bulkAdd(receipts);

  // ===== 支出记录 =====
  const expenses: Expense[] = [];
  const categories: Array<'材料费' | '人工费' | '外包费' | '管理费' | '其他'> = ['材料费', '人工费', '外包费', '管理费', '其他'];
  const suppliers = ['杭州建材城', '李师傅施工队', '美家设计工作室', '万通水电', '金源木业', '华新油漆', '顺达物流'];

  for (const c of contracts) {
    const expenseCount = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < expenseCount; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const amount = Math.round((c.contractAmount * (0.05 + Math.random() * 0.15)) * 100) / 100;
      const dateOffset = -(Math.floor(Math.random() * Math.max(1, Math.abs(now.diff(c.signDate, 'month')))));
      expenses.push({
        id: id(),
        contractId: c.id,
        contractNo: c.contractNo,
        bizType: c.bizType,
        category,
        amount,
        supplier: suppliers[Math.floor(Math.random() * suppliers.length)],
        payMethod: '银行转账',
        expenseDate: now.subtract(Math.abs(dateOffset), 'month').format('YYYY-MM-DD'),
        status: '已付',
        remark: '',
        createdAt: now.subtract(Math.abs(dateOffset), 'month').toISOString(),
        attachments: [],
      });
    }
  }
  await expensesAPI.bulkAdd(expenses);

  // ===== 报销记录 =====
  const reimbursements: Reimbursement[] = [
    { id: id(), applicant: '陈工', department: '工程部', type: '交通费', amount: 356.5, expenseDate: now.subtract(15, 'day').format('YYYY-MM-DD'), description: '杭州-临安项目往返油费及高速费', attachments: [], status: '已打款', reviewComment: '同意报销', reviewer: '王总', reviewDate: now.subtract(12, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: now.subtract(10, 'day').format('YYYY-MM-DD'), createdAt: now.subtract(15, 'day').toISOString() },
    { id: id(), applicant: '王工', department: '工程部', type: '采购费', amount: 2850, expenseDate: now.subtract(10, 'day').format('YYYY-MM-DD'), description: '采购墙面修补材料一批', attachments: [], status: '已审核', reviewComment: '审核通过，请财务安排打款', reviewer: '王总', reviewDate: now.subtract(8, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: '', createdAt: now.subtract(10, 'day').toISOString() },
    { id: id(), applicant: '刘工', department: '设计部', type: '差旅费', amount: 1820, expenseDate: now.subtract(7, 'day').format('YYYY-MM-DD'), description: '上海家居博览会出差，含住宿2晚+往返高铁', attachments: [], status: '已打款', reviewComment: '合理差旅费用', reviewer: '王总', reviewDate: now.subtract(5, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: now.subtract(3, 'day').format('YYYY-MM-DD'), createdAt: now.subtract(7, 'day').toISOString() },
    { id: id(), applicant: '小李', department: '行政部', type: '业务招待费', amount: 680, expenseDate: now.subtract(5, 'day').format('YYYY-MM-DD'), description: '接待意向客户晚餐费用', attachments: [], status: '待审核', reviewComment: '', reviewer: '', reviewDate: '', paymentVoucher: '', paymentDate: '', createdAt: now.subtract(5, 'day').toISOString() },
    { id: id(), applicant: '陈工', department: '工程部', type: '交通费', amount: 210, expenseDate: now.subtract(3, 'day').format('YYYY-MM-DD'), description: '项目现场巡查停车费及过路费', attachments: [], status: '待审核', reviewComment: '', reviewer: '', reviewDate: '', paymentVoucher: '', paymentDate: '', createdAt: now.subtract(3, 'day').toISOString() },
    { id: id(), applicant: '小张', department: '市场部', type: '差旅费', amount: 1560, expenseDate: now.subtract(20, 'day').format('YYYY-MM-DD'), description: '南京客户洽谈出差', attachments: [], status: '已驳回', reviewComment: '缺少住宿发票，请补交', reviewer: '王总', reviewDate: now.subtract(18, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: '', createdAt: now.subtract(20, 'day').toISOString() },
    { id: id(), applicant: '王工', department: '工程部', type: '采购费', amount: 1250, expenseDate: now.subtract(30, 'day').format('YYYY-MM-DD'), description: '临时采购防水材料', attachments: [], status: '已打款', reviewComment: '', reviewer: '王总', reviewDate: now.subtract(28, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: now.subtract(25, 'day').format('YYYY-MM-DD'), createdAt: now.subtract(30, 'day').toISOString() },
    { id: id(), applicant: '刘工', department: '设计部', type: '其他', amount: 890, expenseDate: now.subtract(12, 'day').format('YYYY-MM-DD'), description: '设计软件年费续费', attachments: [], status: '已审核', reviewComment: '', reviewer: '王总', reviewDate: now.subtract(10, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: '', createdAt: now.subtract(12, 'day').toISOString() },
    { id: id(), applicant: '小李', department: '行政部', type: '交通费', amount: 128, expenseDate: now.subtract(2, 'day').format('YYYY-MM-DD'), description: '外出办事打车费', attachments: [], status: '待审核', reviewComment: '', reviewer: '', reviewDate: '', paymentVoucher: '', paymentDate: '', createdAt: now.subtract(2, 'day').toISOString() },
    { id: id(), applicant: '小赵', department: '市场部', type: '业务招待费', amount: 2350, expenseDate: now.subtract(8, 'day').format('YYYY-MM-DD'), description: '大客户商务宴请费用', attachments: [], status: '已打款', reviewComment: '符合招待标准', reviewer: '王总', reviewDate: now.subtract(6, 'day').format('YYYY-MM-DD'), paymentVoucher: '', paymentDate: now.subtract(4, 'day').format('YYYY-MM-DD'), createdAt: now.subtract(8, 'day').toISOString() },
  ];
  await reimbursementsAPI.bulkAdd(reimbursements);

  // ===== 总店收入种子数据 =====
  const genIncomes: GeneralIncome[] = [];
  for (let m = 5; m >= 0; m--) {
    const month = now.subtract(m, 'month');
    const daysInMonth = month.daysInMonth();
    genIncomes.push({
      id: id(), category: '设计费',
      amount: Math.round((5000 + Math.random() * 10000) * 100) / 100,
      source: `设计服务-${month.format('YYYY年MM月')}`,
      incomeDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'),
      remark: '', createdAt: month.toISOString(),
    });
    genIncomes.push({
      id: id(), category: '管理费',
      amount: Math.round((2000 + Math.random() * 6000) * 100) / 100,
      source: `项目管理费-${month.format('YYYY年MM月')}`,
      incomeDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'),
      remark: '', createdAt: month.toISOString(),
    });
    if (Math.random() > 0.3) {
      genIncomes.push({
        id: id(), category: '其他收入',
        amount: Math.round((1000 + Math.random() * 4000) * 100) / 100,
        source: '材料推荐佣金',
        incomeDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'),
        remark: '', createdAt: month.toISOString(),
      });
    }
  }
  await generalIncomesAPI.bulkAdd(genIncomes);

  // ===== 总店支出种子数据 =====
  const genExpenses: GeneralExpense[] = [];
  const genPayees: Record<string, string> = {
    '房租': '嘉华物业租赁部', '水电物业': '杭州电力/水务公司', '行政工资': '公司行政部',
    '办公用品': '得力文具旗舰店', '营销推广': '字节跳动广告', '交通物流': '顺丰速运',
    '其他': '杂项',
  };
  for (let m = 5; m >= 0; m--) {
    const month = now.subtract(m, 'month');
    const daysInMonth = month.daysInMonth();
    genExpenses.push({
      id: id(), category: '房租', amount: 15000, payee: genPayees['房租'],
      expenseDate: month.date(5).format('YYYY-MM-DD'), remark: `${month.format('YYYY年MM月')}办公室租金`,
      createdAt: month.toISOString(),
    });
    genExpenses.push({
      id: id(), category: '水电物业', amount: Math.round((2000 + Math.random() * 1500) * 100) / 100,
      payee: genPayees['水电物业'],
      expenseDate: month.date(10).format('YYYY-MM-DD'), remark: `${month.format('YYYY年MM月')}水电及物业费`,
      createdAt: month.toISOString(),
    });
    genExpenses.push({
      id: id(), category: '行政工资', amount: 25000 + Math.round(Math.random() * 3000),
      payee: genPayees['行政工资'],
      expenseDate: month.date(28).format('YYYY-MM-DD'), remark: `${month.format('YYYY年MM月')}行政人员薪资`,
      createdAt: month.toISOString(),
    });
    genExpenses.push({
      id: id(), category: '办公用品', amount: Math.round((500 + Math.random() * 1500) * 100) / 100,
      payee: genPayees['办公用品'],
      expenseDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'), remark: '办公耗材采购',
      createdAt: month.toISOString(),
    });
    genExpenses.push({
      id: id(), category: '营销推广', amount: Math.round((3000 + Math.random() * 5000) * 100) / 100,
      payee: genPayees['营销推广'],
      expenseDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'),
      remark: `${month.format('MM月')}线上推广投放`, createdAt: month.toISOString(),
    });
    genExpenses.push({
      id: id(), category: '交通物流', amount: Math.round((1000 + Math.random() * 2000) * 100) / 100,
      payee: genPayees['交通物流'],
      expenseDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'), remark: '材料运输及物流费',
      createdAt: month.toISOString(),
    });
    if (Math.random() > 0.4) {
      genExpenses.push({
        id: id(), category: '其他', amount: Math.round((500 + Math.random() * 1500) * 100) / 100,
        payee: genPayees['其他'],
        expenseDate: month.date(Math.floor(Math.random() * daysInMonth) + 1).format('YYYY-MM-DD'), remark: '杂项支出',
        createdAt: month.toISOString(),
      });
    }
  }
  await generalExpensesAPI.bulkAdd(genExpenses);

  // ===== 默认用户 =====
  const userCount = await usersAPI.count();
  if (userCount === 0) {
    await usersAPI.bulkAdd([
      { id: id(), username: 'admin', password: 'admin123', name: '王总', role: 'admin', createdAt: now.toISOString() },
      { id: id(), username: 'finance', password: 'finance123', name: '李会计', role: 'finance', createdAt: now.toISOString() },
      { id: id(), username: 'employee', password: 'emp123', name: '陈工', role: 'employee', createdAt: now.toISOString() },
    ]);
  }

  console.log('种子数据初始化完成（家装+工装双业务版）');
}

function makeStages(total: number): PaymentStage[] {
  const stages: PaymentStage[] = [
    { name: '一期款', amount: Math.round(total * 0.3 * 100) / 100, ratio: 0.3 },
    { name: '二期款', amount: Math.round(total * 0.3 * 100) / 100, ratio: 0.3 },
    { name: '三期款', amount: Math.round(total * 0.25 * 100) / 100, ratio: 0.25 },
    { name: '尾款', amount: Math.round(total * 0.15 * 100) / 100, ratio: 0.15 },
  ];
  return stages;
}
