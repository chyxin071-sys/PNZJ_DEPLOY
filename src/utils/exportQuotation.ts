import * as XLSX from 'xlsx';
import { Quotation, Contract } from '@/types';
import { formatMoney } from './format';

export const exportQuotationToExcel = (quotation: Quotation) => {
  const wb = XLSX.utils.book_new();
  const data = quotation.detailedData;
  if (!data) return;

  const headerStyle = { font: { bold: true } };

  // Helper to create a sheet with a title block
  const createSheet = (title: string, columns: string[], rows: any[][]) => {
    const wsData = [
      [title],
      [`客户名称: ${quotation.customerName || ''}`, `客户电话: ${quotation.customerPhone || ''}`],
      [`项目地址: ${quotation.houseAddress || ''}`, `业务类型: ${quotation.bizType || ''}`, `日期: ${quotation.quotationDate}`],
      columns,
      ...rows
    ];
    return XLSX.utils.aoa_to_sheet(wsData);
  };

  if (quotation.bizType === '工装') {
    const commercialData = data.commercialWorks || [];
    
    // Group by category
    const categories = ['装饰工程', '安装工程', '消防工程', '其他工程'];
    
    categories.forEach(category => {
      const items = commercialData.filter(item => item.category === category);
      if (items.length > 0) {
        const rows = items.map((item, idx) => [
          idx + 1, item.projectName, item.description, item.unit, item.quantity, item.unitPrice, item.amount, item.remark
        ]);
        const ws = createSheet(`品诺筑家 - ${category}`, 
          ['序号', '项目名称', '项目特征描述', '单位', '工程量', '综合单价（元）', '合价（元）', '备注'],
          rows
        );
        XLSX.utils.book_append_sheet(wb, ws, category);
      }
    });

    if (wb.SheetNames.length === 0) {
      // Create empty sheet if nothing
      const ws = createSheet(`品诺筑家 - 装饰工程`, 
        ['序号', '项目名称', '项目特征描述', '单位', '工程量', '综合单价（元）', '合价（元）', '备注'],
        []
      );
      XLSX.utils.book_append_sheet(wb, ws, '装饰工程');
    }

    const fileName = `工装报价单_${quotation.customerName || '客户'}_${quotation.version}.xlsx`;
    XLSX.writeFile(wb, fileName);
    return;
  }

  // 1. 基础装修报价
  const basicRows = data.basicWorks.map((item, idx) => [
    idx + 1, item.description, item.name, item.unit, item.quantity, item.unitPrice, item.amount, item.remark
  ]);
  const wsBasic = createSheet('品诺筑家整体家装报价单', 
    ['序号', '属性说明', '项目内容/材料名称', '单位', '数量', '综合单价（元）', '预算金额（元）', '材料及施工说明'],
    basicRows
  );
  XLSX.utils.book_append_sheet(wb, wsBasic, '基础装修报价');

  // 2. 门类
  const doorRows = data.doors.map((item) => [
    item.category, item.name, item.unit, item.quantity, item.unitPrice, item.amount, item.remark
  ]);
  const wsDoors = createSheet('门类', 
    ['类别', '选用材料、规格、品名', '单位', '数量', '单价', '金额', '备 注'],
    doorRows
  );
  XLSX.utils.book_append_sheet(wb, wsDoors, '门类');

  // 3. 主材
  const materialRows = data.mainMaterials.map((item) => [
    item.category, item.name, item.unit, item.quantity, item.unitPrice, item.amount, item.remark
  ]);
  const wsMaterials = createSheet('主材', 
    ['类别', '选用材料、规格、品名', '单位', '数量', '单价', '金额', '备 注'],
    materialRows
  );
  XLSX.utils.book_append_sheet(wb, wsMaterials, '主材');

  // 4. 品诺（定制）
  const customRows = data.customFurnitures.map((item) => [
    item.space, item.name, item.area, item.unit, item.unitPrice, item.amount, item.cabinetMaterial, item.doorMaterial, item.remark
  ]);
  const wsCustom = createSheet('三房两厅定制定制报价单', 
    ['空间', '产品名称', '面积', '单位', '单价', '金额', '柜体基材', '门板基材', '备注'],
    customRows
  );
  XLSX.utils.book_append_sheet(wb, wsCustom, '品诺');

  // 5. 个性化项目
  const personalizedRows = data.personalizedWorks.map((item, idx) => [
    idx + 1, item.projectName, item.materialName, item.unit, item.quantity, item.materialUnitPrice, item.materialAmount, item.laborUnitPrice, item.laborAmount, item.totalAmount
  ]);
  const wsPersonalized = createSheet('个性化项目', 
    ['项目编号', '工程项目', '材料', '单位', '数量', '材料单价', '材料金额', '人工单价', '人工金额', '合计金额'],
    personalizedRows
  );
  XLSX.utils.book_append_sheet(wb, wsPersonalized, '个性化项目');

  // 6. 其他项目
  const otherRows = data.otherWorks.map((item, idx) => [
    idx + 1, item.projectName, item.materialName, item.unit, item.quantity, item.materialUnitPrice, item.materialAmount, item.laborUnitPrice, item.laborAmount, item.totalAmount
  ]);
  const wsOther = createSheet('其他项目', 
    ['项目编号', '工程项目', '材料', '单位', '数量', '材料单价', '材料金额', '人工单价', '人工金额', '合计金额'],
    otherRows
  );
  XLSX.utils.book_append_sheet(wb, wsOther, '其他项目');

  // 7. 不包含项目
  const excludedRows = data.excludedItems.map(item => [item]);
  const wsExcluded = createSheet('不包含项目', ['项目名称'], excludedRows);
  XLSX.utils.book_append_sheet(wb, wsExcluded, '不包含项目');

  // Save to file
  const fileName = `报价单_${quotation.customerName || '客户'}_${quotation.version}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
