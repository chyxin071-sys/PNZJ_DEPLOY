import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Download, FileText, User, Wallet } from 'lucide-react';
import { quotesAPI } from '@/db/api';
import { formatDate, formatMoney } from '@/utils/format';
import { normalizeAttachments, openAttachment } from '@/utils/financeAttachments';

export default function QuoteBizDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [quote, setQuote] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      if (!id) {
        setQuote(null);
        setLoaded(true);
        return;
      }

      try {
        const data = await quotesAPI.doc(id).get();
        if (!cancelled) {
          setQuote(data || null);
        }
      } catch {
        if (!cancelled) {
          setQuote(null);
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    setLoaded(false);
    void loadQuote();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const items = useMemo(() => {
    if (!Array.isArray(quote?.items)) return [];
    return quote.items;
  }, [quote]);

  const attachments = useMemo(() => normalizeAttachments(quote?.attachments), [quote?.attachments]);

  if (!loaded) {
    return (
      <div className="erp-page">
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center text-sm text-gray-500">
          加载中...
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="erp-page">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft size={16} />
          返回报价列表
        </button>
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center text-sm text-gray-500">
          未找到该报价单
        </div>
      </div>
    );
  }

  return (
    <div className="erp-page">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-800"
      >
        <ArrowLeft size={16} />
        返回报价列表
      </button>

      <div className="rounded-2xl border border-gray-100 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{quote.leadName || '未命名报价单'}</h1>
              <p className="mt-1 text-gold-500 text-sm">报价单详情</p>
            </div>
            <span className="rounded-full bg-gold-50 px-3 py-1 text-xs font-medium text-gold-700">
              {quote.status || '草稿'}
            </span>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
              <FileText size={14} />
              报价单号
            </div>
            <p className="text-sm font-medium text-gray-900">{quote.quoteNo || '-'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
              <Wallet size={14} />
              报价金额
            </div>
            <p className="text-sm font-medium text-gray-900">{formatMoney(quote.totalAmount || 0)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
              <Calendar size={14} />
              创建时间
            </div>
            <p className="text-sm font-medium text-gray-900">{formatDate(quote.createdAt)}</p>
          </div>
        </div>

        <div className="grid gap-4 border-t border-gray-100 px-5 py-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
              <User size={14} />
              创建人
            </div>
            <p className="text-sm text-gray-800">{quote.creatorName || '-'}</p>
          </div>
          <div>
            <div className="mb-2 text-xs text-gray-400">备注</div>
            <p className="text-sm text-gray-800">{quote.remark || '暂无备注'}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-5">
          <div className="mb-3 text-sm font-medium text-gray-900">报价附件</div>
          {attachments.length === 0 ? (
            <div className="rounded-xl bg-gray-50 px-4 py-4 text-sm text-gray-500">暂无报价附件</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <button
                  key={`${file.fileID}-${index}`}
                  type="button"
                  onClick={() => void openAttachment(file)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800 hover:bg-gold-100"
                >
                  <Download size={14} />
                  <span className="max-w-[220px] truncate">{file.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-5">
          <div className="mb-3 text-sm font-medium text-gray-900">报价项目</div>
          {items.length === 0 ? (
            <div className="rounded-xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">暂无项目明细</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">项目</th>
                    <th className="px-4 py-3 font-medium">数量</th>
                    <th className="px-4 py-3 font-medium">单价</th>
                    <th className="px-4 py-3 font-medium">小计</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-gray-800">
                  {items.map((item: any, index: number) => (
                    <tr key={`${item.name || 'item'}-${index}`}>
                      <td className="px-4 py-3">{item.name || '-'}</td>
                      <td className="px-4 py-3">{item.quantity ?? '-'}</td>
                      <td className="px-4 py-3">{formatMoney(item.unitPrice || 0)}</td>
                      <td className="px-4 py-3">{formatMoney(item.total || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
