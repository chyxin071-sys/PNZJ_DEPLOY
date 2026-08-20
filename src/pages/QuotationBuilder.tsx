import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Download, Plus, Trash2, Calculator, Edit3 } from 'lucide-react';
import { useFinanceStore } from '@/store/financeStore';
import { Quotation, QuotationData, BasicWorkItem, DoorItem, MainMaterialItem, CustomFurnitureItem, PersonalizedWorkItem, CommercialWorkItem } from '@/types';
import { exportQuotationToExcel } from '@/utils/exportQuotation';
import { generateId } from '@/utils/format';
import { useDialogStore } from '@/store/dialogStore';

const INITIAL_DATA: QuotationData = {
  basicWorks: [],
  doors: [],
  mainMaterials: [],
  customFurnitures: [],
  personalizedWorks: [],
  otherWorks: [],
  excludedItems: [
    '家具（沙发、茶几、电视柜、餐桌椅、床）',
    '家电（电视、冰箱、洗衣机、烟机炉盘、燃气热水器、净水器、管线机、晾衣架）',
    '窗帘、灯具（全房）',
    '开关插座（包安装）',
    '卫浴（坐便器、花洒、浴室柜）',
    '美缝（全房）'
  ],
  commercialWorks: [],
};

const TABS = [
  { id: 'basic', label: '基础装修' },
  { id: 'doors', label: '门类' },
  { id: 'materials', label: '主材' },
  { id: 'custom', label: '全屋定制' },
  { id: 'personalized', label: '个性化项目' },
  { id: 'other', label: '其他项目' },
  { id: 'excluded', label: '不包含项目' },
];

const COMMERCIAL_TABS = [
  { id: 'commercial_deco', label: '装饰工程' },
  { id: 'commercial_mep', label: '安装工程' },
  { id: 'commercial_fire', label: '消防工程' },
  { id: 'commercial_other', label: '其他工程' },
];

export default function QuotationBuilder() {
  const { sourceType, sourceId, quotationId } = useParams();
  const [searchParams] = useSearchParams();
  const isViewMode = searchParams.get('mode') === 'view';
  const navigate = useNavigate();
  const { contracts, quotations, addQuotation, updateQuotation } = useFinanceStore();
  const { showAlert } = useDialogStore();

  const backPath = sourceType === 'contract' && sourceId
    ? `/contracts/${sourceId}`
    : sourceType === 'lead' && sourceId
      ? `/leads/${sourceId}`
      : '/quotes-biz';

  const contract = useMemo(() => sourceType === 'contract' ? contracts.find(c => c.id === sourceId) : null, [contracts, sourceId, sourceType]);
  
  // 对于 sourceType === 'lead' 的情况，我们需要加载 lead 数据来获取客户信息
  const [lead, setLead] = useState<any>(null);
  useEffect(() => {
    if (sourceType === 'lead' && sourceId) {
      import('@/db/api').then(({ leadsAPI }) => {
        leadsAPI.doc(sourceId).get().then(res => {
          setLead(Array.isArray(res) ? res[0] : res);
        }).catch(console.error);
      });
    }
  }, [sourceType, sourceId]);

  const customerName = contract?.customerName || lead?.name || '';
  const customerPhone = contract?.customerPhone || lead?.phone || '';
  const houseAddress = contract?.houseAddress || lead?.address || '';
  const bizType = contract?.bizType || lead?.bizType || '家装';
  const relatedNo = contract?.contractNo || '';
  
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    if (bizType === '工装' && !COMMERCIAL_TABS.find(t => t.id === activeTab)) {
      setActiveTab('commercial_deco');
    } else if (bizType === '家装' && !TABS.find(t => t.id === activeTab)) {
      setActiveTab('basic');
    }
  }, [bizType]);
  
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<'草稿'|'已发送'|'已确认'|'已作废'>('草稿');
  const [data, setData] = useState<QuotationData>(INITIAL_DATA);

  useEffect(() => {
    if (quotationId && quotationId !== 'new') {
      const q = quotations.find(q => q.id === quotationId);
      if (q) {
        setVersion(q.version);
        setStatus(q.status);
        if (q.detailedData) setData(q.detailedData);
      }
    } else {
      const count = quotations.filter(q => (sourceType === 'contract' && q.contractId === sourceId) || (sourceType === 'lead' && q.leadId === sourceId)).length;
      setVersion(`V${count + 1}.0`);
    }
  }, [quotationId, quotations, sourceId, sourceType]);

  const calculateTotalAmount = () => {
    const sum = (arr: any[]) => arr?.reduce((acc, curr) => acc + (Number(curr.amount || curr.totalAmount) || 0), 0) || 0;
    if (bizType === '工装') {
      return sum(data.commercialWorks || []);
    }
    return sum(data.basicWorks) + sum(data.doors) + sum(data.mainMaterials) + 
           sum(data.customFurnitures) + sum(data.personalizedWorks) + sum(data.otherWorks);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const totalAmount = calculateTotalAmount();
      const q: Quotation = {
        id: quotationId === 'new' ? generateId() : quotationId!,
        contractId: sourceType === 'contract' ? sourceId : undefined,
        contractNo: sourceType === 'contract' ? relatedNo : undefined,
        leadId: sourceType === 'lead' ? sourceId : undefined,
        customerName,
        customerPhone,
        houseAddress,
        bizType,
        version,
        amount: totalAmount,
        content: `基础装修及主材定制报价 (工程总造价: ￥${totalAmount.toLocaleString()})`,
        detailedData: data,
        attachments: [],
        status,
        quotationDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      };

      if (quotationId === 'new') {
        await addQuotation(q);
      } else {
        await updateQuotation(q);
      }
      await showAlert('报价单保存成功！');
      navigate(backPath);
    } catch (e) {
      await showAlert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const q: Quotation = {
      id: 'temp',
      contractId: sourceType === 'contract' ? sourceId : undefined,
      contractNo: sourceType === 'contract' ? relatedNo : undefined,
      leadId: sourceType === 'lead' ? sourceId : undefined,
      customerName,
      customerPhone,
      houseAddress,
      bizType,
      version,
      amount: calculateTotalAmount(),
      content: '',
      detailedData: data,
      attachments: [],
      status,
      quotationDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };
    exportQuotationToExcel(q);
  };

  // ---- Renders for different tabs ----
  
  const updateArray = (key: keyof QuotationData, index: number, field: string, value: any) => {
    const arr = [...data[key] as any[]];
    arr[index][field] = value;
    
    // Auto-calculate amount
    if (['quantity', 'unitPrice', 'area'].includes(field)) {
      const q = Number(arr[index].quantity || arr[index].area) || 0;
      const p = Number(arr[index].unitPrice) || 0;
      arr[index].amount = q * p;
    }
    if (['quantity', 'materialUnitPrice', 'laborUnitPrice'].includes(field)) {
      const q = Number(arr[index].quantity) || 0;
      const mp = Number(arr[index].materialUnitPrice) || 0;
      const lp = Number(arr[index].laborUnitPrice) || 0;
      arr[index].materialAmount = q * mp;
      arr[index].laborAmount = q * lp;
      arr[index].totalAmount = arr[index].materialAmount + arr[index].laborAmount;
    }
    
    setData({ ...data, [key]: arr });
  };

  const addRow = (key: keyof QuotationData, emptyObj: any) => {
    setData({ ...data, [key]: [...data[key] as any[], { id: generateId(), ...emptyObj }] });
  };

  const removeRow = (key: keyof QuotationData, index: number) => {
    const arr = [...data[key] as any[]];
    arr.splice(index, 1);
    setData({ ...data, [key]: arr });
  };

  const renderInput = (key: keyof QuotationData, index: number, field: string, value: any, type = 'text', width = 'w-full') => {
    if (isViewMode) {
      return <div className={`px-2 py-1 text-sm text-gray-700 ${width} truncate`} title={String(value || '')}>{value || '-'}</div>;
    }
    return (
      <input type={type} value={value} onChange={e => updateArray(key, index, field, e.target.value)}
        className={`${width} px-2 py-1 text-sm border-gray-200 rounded focus:ring-1 focus:ring-gray-900 border`} />
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-3 py-3 md:px-6 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0 sticky top-0 z-10">
        <div className="flex items-start md:items-center gap-2.5 md:gap-4 min-w-0">
          <button onClick={() => navigate(backPath)} className="p-1.5 md:p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
            <ArrowLeft size={18} className="text-gray-600 md:w-5 md:h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold text-gray-900">{quotationId === 'new' ? '新建报价单' : '编辑报价单'}</h1>
            <p className="text-xs md:text-sm text-gray-500 truncate">{customerName || '未关联客户'}{houseAddress ? ` · ${houseAddress}` : ''}{relatedNo ? ` · 合同 ${relatedNo}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:mr-4">
            <span className="hidden md:inline text-sm text-gray-600">版本:</span>
            {isViewMode ? (
              <span className="h-8 inline-flex items-center rounded border border-gray-200 px-2 text-xs md:text-sm font-medium text-gray-900 md:mr-2">{version}</span>
            ) : (
              <input value={version} onChange={e => setVersion(e.target.value)} className="h-8 w-full md:w-20 px-2 py-1 text-xs md:text-sm border rounded" />
            )}
            {isViewMode ? (
              <span className="h-8 inline-flex items-center justify-center px-2 py-1 text-xs rounded bg-gray-100">{status}</span>
            ) : (
              <select value={status} onChange={e => setStatus(e.target.value as any)} className="h-8 w-full md:w-auto px-2 py-1 text-xs md:text-sm border rounded bg-white">
                <option value="草稿">草稿</option>
                <option value="已发送">已发送</option>
                <option value="已确认">已确认</option>
                <option value="已作废">已作废</option>
              </select>
            )}
          </div>
          <div className="text-xs md:text-sm font-bold text-gray-900 bg-gray-100 px-3 py-2 md:py-1.5 rounded flex items-center justify-between md:justify-start gap-2">
            <Calculator size={16} /> 总造价：￥{calculateTotalAmount().toLocaleString()}
          </div>
          <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-3">
          <button onClick={handleExport} className="h-9 px-3 md:px-4 text-xs md:text-sm bg-white border border-gray-200 text-gray-700 rounded hover:bg-gray-50 font-medium flex items-center justify-center gap-1.5 md:gap-2">
            <Download size={15} /> 导出
          </button>
          {isViewMode ? (
            <button onClick={() => navigate(`/quotation-builder/${sourceType}/${sourceId}/${quotationId}`)} className="h-9 px-3 md:px-4 text-xs md:text-sm bg-gray-900 text-white rounded hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5 md:gap-2">
              <Edit3 size={15} /> 编辑
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving} className="h-9 px-3 md:px-4 text-xs md:text-sm bg-gray-900 text-white rounded hover:bg-gray-800 font-medium flex items-center justify-center gap-1.5 md:gap-2">
              <Save size={15} /> {saving ? '保存中...' : '保存'}
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-3 md:p-6">
        <div className="flex gap-1 bg-white p-1 rounded shadow-sm border border-gray-100 shrink-0 mb-3 md:mb-4 overflow-x-auto scrollbar-hide">
          {(bizType === '工装' ? COMMERCIAL_TABS : TABS).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-md whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white rounded shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto p-2 md:p-4 [&_table]:min-w-[760px] md:[&_table]:min-w-0 [&_th]:text-[11px] md:[&_th]:text-sm [&_td_input]:text-[12px] md:[&_td_input]:text-sm">
            {bizType === '工装' && (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="p-2 border font-medium w-48">项目名称</th>
                    <th className="p-2 border font-medium w-64">项目特征描述</th>
                    <th className="p-2 border font-medium w-16">单位</th>
                    <th className="p-2 border font-medium w-24">工程量</th>
                    <th className="p-2 border font-medium w-24">综合单价</th>
                    <th className="p-2 border font-medium w-24">合价</th>
                    <th className="p-2 border font-medium">备注</th>
                    {!isViewMode && <th className="p-2 border w-12">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {(data.commercialWorks || []).map((item, idx) => {
                    const currentTabLabel = COMMERCIAL_TABS.find(t => t.id === activeTab)?.label || '其他工程';
                    if (item.category !== currentTabLabel) return null;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'projectName', item.projectName)}</td>
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'description', item.description)}</td>
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'unit', item.unit)}</td>
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'quantity', item.quantity, 'number')}</td>
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'unitPrice', item.unitPrice, 'number')}</td>
                        <td className="p-1 border bg-gray-50 text-right pr-2">￥{item.amount}</td>
                        <td className="p-1 border">{renderInput('commercialWorks', idx, 'remark', item.remark)}</td>
                        {!isViewMode && (
                          <td className="p-1 border text-center">
                            <button onClick={() => removeRow('commercialWorks', idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* 1. 基础装修 */}
            {bizType === '家装' && activeTab === 'basic' && (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="p-2 border font-medium w-32">空间</th>
                    <th className="p-2 border font-medium w-48">属性说明</th>
                    <th className="p-2 border font-medium w-64">项目内容/材料名称</th>
                    <th className="p-2 border font-medium w-16">单位</th>
                    <th className="p-2 border font-medium w-24">数量</th>
                    <th className="p-2 border font-medium w-24">单价</th>
                    <th className="p-2 border font-medium w-24">金额</th>
                    <th className="p-2 border font-medium">备注</th>
                    {!isViewMode && <th className="p-2 border w-12">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.basicWorks.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'space', item.space)}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'description', item.description)}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'name', item.name)}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'unit', item.unit)}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'quantity', item.quantity)}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'unitPrice', item.unitPrice, 'number')}</td>
                      <td className="p-1 border bg-gray-50 text-right pr-2">￥{item.amount}</td>
                      <td className="p-1 border">{renderInput('basicWorks', idx, 'remark', item.remark)}</td>
                      {!isViewMode && (
                        <td className="p-1 border text-center">
                          <button onClick={() => removeRow('basicWorks', idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 2. 门类 & 3. 主材 */}
            {bizType === '家装' && (activeTab === 'doors' || activeTab === 'materials') && (() => {
              const key = activeTab === 'doors' ? 'doors' : 'mainMaterials';
              const arr = data[key] as any[];
              return (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="p-2 border font-medium w-48">类别</th>
                      <th className="p-2 border font-medium w-64">选用材料、规格、品名</th>
                      <th className="p-2 border font-medium w-16">单位</th>
                      <th className="p-2 border font-medium w-24">数量</th>
                      <th className="p-2 border font-medium w-24">单价</th>
                      <th className="p-2 border font-medium w-24">金额</th>
                      <th className="p-2 border font-medium">备注</th>
                      {!isViewMode && <th className="p-2 border w-12">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {arr.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="p-1 border">{renderInput(key, idx, 'category', item.category)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'name', item.name)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'unit', item.unit)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'quantity', item.quantity, 'number')}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'unitPrice', item.unitPrice, 'number')}</td>
                        <td className="p-1 border bg-gray-50 text-right pr-2">￥{item.amount}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'remark', item.remark)}</td>
                        {!isViewMode && (
                          <td className="p-1 border text-center">
                            <button onClick={() => removeRow(key, idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}

            {/* 4. 全屋定制 */}
            {bizType === '家装' && activeTab === 'custom' && (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="p-2 border font-medium w-24">空间</th>
                    <th className="p-2 border font-medium w-32">产品名称</th>
                    <th className="p-2 border font-medium w-24">面积/长度</th>
                    <th className="p-2 border font-medium w-16">单位</th>
                    <th className="p-2 border font-medium w-24">单价</th>
                    <th className="p-2 border font-medium w-24">金额</th>
                    <th className="p-2 border font-medium w-32">柜体基材</th>
                    <th className="p-2 border font-medium w-32">门板基材</th>
                    <th className="p-2 border font-medium">备注</th>
                    {!isViewMode && <th className="p-2 border w-12">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.customFurnitures.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'space', item.space)}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'name', item.name)}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'area', item.area, 'number')}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'unit', item.unit)}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'unitPrice', item.unitPrice, 'number')}</td>
                      <td className="p-1 border bg-gray-50 text-right pr-2">￥{item.amount}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'cabinetMaterial', item.cabinetMaterial)}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'doorMaterial', item.doorMaterial)}</td>
                      <td className="p-1 border">{renderInput('customFurnitures', idx, 'remark', item.remark)}</td>
                      {!isViewMode && (
                        <td className="p-1 border text-center">
                          <button onClick={() => removeRow('customFurnitures', idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* 5. 个性化项目 & 6. 其他项目 */}
            {bizType === '家装' && (activeTab === 'personalized' || activeTab === 'other') && (() => {
              const key = activeTab === 'personalized' ? 'personalizedWorks' : 'otherWorks';
              const arr = data[key] as any[];
              return (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="p-2 border font-medium w-48">工程项目</th>
                      <th className="p-2 border font-medium w-64">材料规格/工艺</th>
                      <th className="p-2 border font-medium w-16">单位</th>
                      <th className="p-2 border font-medium w-24">数量</th>
                      <th className="p-2 border font-medium w-24 bg-blue-50/50">材料单价</th>
                      <th className="p-2 border font-medium w-24 bg-blue-50/50">材料金额</th>
                      <th className="p-2 border font-medium w-24 bg-emerald-50/50">人工单价</th>
                      <th className="p-2 border font-medium w-24 bg-emerald-50/50">人工金额</th>
                      <th className="p-2 border font-medium w-24 bg-amber-50/50">合计金额</th>
                      {!isViewMode && <th className="p-2 border w-12">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {arr.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-gray-50/50">
                        <td className="p-1 border">{renderInput(key, idx, 'projectName', item.projectName)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'materialName', item.materialName)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'unit', item.unit)}</td>
                        <td className="p-1 border">{renderInput(key, idx, 'quantity', item.quantity, 'number')}</td>
                        <td className="p-1 border bg-blue-50/20">{renderInput(key, idx, 'materialUnitPrice', item.materialUnitPrice, 'number')}</td>
                        <td className="p-1 border bg-blue-50/40 text-right pr-2">￥{item.materialAmount}</td>
                        <td className="p-1 border bg-emerald-50/20">{renderInput(key, idx, 'laborUnitPrice', item.laborUnitPrice, 'number')}</td>
                        <td className="p-1 border bg-emerald-50/40 text-right pr-2">￥{item.laborAmount}</td>
                        <td className="p-1 border bg-amber-50/40 text-right pr-2 font-medium">￥{item.totalAmount}</td>
                        {!isViewMode && (
                          <td className="p-1 border text-center">
                            <button onClick={() => removeRow(key, idx)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}

            {/* 7. 不包含项目 */}
            {bizType === '家装' && activeTab === 'excluded' && (
              <div className="max-w-2xl">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="p-2 border font-medium">不包含项目说明</th>
                      {!isViewMode && <th className="p-2 border w-12">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.excludedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="p-1 border">
                          {isViewMode ? (
                            <div className="px-2 py-1 text-sm text-gray-700">{item}</div>
                          ) : (
                            <input type="text" value={item} onChange={e => {
                              const arr = [...data.excludedItems];
                              arr[idx] = e.target.value;
                              setData({ ...data, excludedItems: arr });
                            }} className="w-full px-2 py-1 text-sm border-gray-200 rounded focus:ring-1 focus:ring-gray-900 border" />
                          )}
                        </td>
                        {!isViewMode && (
                          <td className="p-1 border text-center">
                            <button onClick={() => {
                              const arr = [...data.excludedItems];
                              arr.splice(idx, 1);
                              setData({ ...data, excludedItems: arr });
                            }} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {!isViewMode && (
            <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <button onClick={() => {
                if (bizType === '工装') {
                  const currentTabLabel = COMMERCIAL_TABS.find(t => t.id === activeTab)?.label || '其他工程';
                  addRow('commercialWorks', { category: currentTabLabel, projectName: '', description: '', unit: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' });
                } else {
                  if (activeTab === 'basic') addRow('basicWorks', { space: '', name: '', description: '', unit: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' });
                  if (activeTab === 'doors') addRow('doors', { category: '', name: '', unit: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' });
                  if (activeTab === 'materials') addRow('mainMaterials', { category: '', name: '', unit: '', quantity: 1, unitPrice: 0, amount: 0, remark: '' });
                  if (activeTab === 'custom') addRow('customFurnitures', { space: '', name: '', area: 1, unit: '㎡', unitPrice: 0, amount: 0, cabinetMaterial: '实木颗粒板', doorMaterial: '实木颗粒板', remark: '' });
                  if (activeTab === 'personalized') addRow('personalizedWorks', { projectName: '', materialName: '', unit: '', quantity: 1, materialUnitPrice: 0, materialAmount: 0, laborUnitPrice: 0, laborAmount: 0, totalAmount: 0 });
                  if (activeTab === 'other') addRow('otherWorks', { projectName: '', materialName: '', unit: '', quantity: 1, materialUnitPrice: 0, materialAmount: 0, laborUnitPrice: 0, laborAmount: 0, totalAmount: 0 });
                  if (activeTab === 'excluded') setData({ ...data, excludedItems: [...data.excludedItems, ''] });
                }
              }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition-colors">
                <Plus size={16} /> 添加一行
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
