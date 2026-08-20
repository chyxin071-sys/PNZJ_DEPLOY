import { Column } from '@/types';
import { useRef, useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeAction<T> {
  label: string | ((row: T) => string);
  onClick: (row: T) => void;
  className?: string;
  width?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyText?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  rowKey?: (row: T) => string;
  /** @deprecated 不再需要，保留以兼容旧代码 */
  onDelete?: (row: T) => void;
  canDelete?: (row: T) => boolean;
  /** 移动端卡片模式下显示的列（传数字取前 N 列，传数组用指定列） */
  mobileCardColumns?: number | Column<T>[];
  /** 移动端卡片左滑操作按钮 */
  mobileSwipeActions?: SwipeAction<T>[];
  /** 需要固定在左侧的列数，默认固定第一列 */
  fixedLeft?: number;
  /** 移动端固定在左侧的列数，默认与 fixedLeft 一致；传 0 则移动端整表跟手横滑 */
  mobileFixedLeft?: number;
  /** 移动端可截断列的最大宽度（px），用于避免单列占满屏，默认 160 */
  mobileTruncateWidth?: number;
  /** 容器最大高度（超过后垂直滚动），默认 '70vh' */
  maxHeight?: string;
  /** 宽表模式：表头滚轮横向移动，表体滚轮保持页面纵向滚动 */
  horizontalScroll?: boolean;
  /** 固定列宽布局，用于必须完整收在可视区域内的表格 */
  fixedLayout?: boolean;
  /** 空状态更紧凑，用于详情页里的记录模块 */
  compactEmpty?: boolean;
}

function hideClass(hideOn?: 'md' | 'lg') {
  if (hideOn === 'md') return 'hidden md:table-cell';
  return '';
}

export default function DataTable<T>({
  columns, data, onRowClick, onDelete, canDelete,
  emptyText = '暂无数据',
  sortField, sortOrder, onSort, rowKey,
  mobileCardColumns,
  mobileSwipeActions,
  fixedLeft = 1,
  mobileFixedLeft = fixedLeft,
  mobileTruncateWidth = 160,
  maxHeight,
  horizontalScroll = false,
  fixedLayout = false,
  compactEmpty = false,
}: DataTableProps<T>) {
  const hasInternalScroll = Boolean(maxHeight && maxHeight !== 'none');

  const containerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; key: string } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  // 鼠标悬停在表头时，滚轮控制横向滚动
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      // 如果表格不需要横向滚动，不做处理
      if (el.scrollWidth <= el.clientWidth) return;
      // 按住 Shift 保持浏览器原生横向滚动
      if (e.shiftKey) return;
      // 仅在鼠标位于 thead 内时，将纵向滚轮转为横向滚动
      const target = e.target as HTMLElement;
      const thead = horizontalScroll ? headerScrollRef.current?.querySelector('thead') : el.querySelector('thead');
      if (!thead || !thead.contains(target)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY + e.deltaX;
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
    };
    const wheelTarget = horizontalScroll ? headerScrollRef.current : el;
    const syncHeader = () => {
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
    };
    wheelTarget?.addEventListener('wheel', handleWheel, { passive: false });
    if (horizontalScroll) el.addEventListener('scroll', syncHeader, { passive: true });
    return () => {
      wheelTarget?.removeEventListener('wheel', handleWheel);
      if (horizontalScroll) el.removeEventListener('scroll', syncHeader);
    };
  }, [horizontalScroll]);

  if (data.length === 0) {
    return <div className={`text-center ${compactEmpty ? 'py-6' : 'py-16'} text-gray-400 text-sm`}>{emptyText}</div>;
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-gray-400 text-xs ml-1 opacity-30">↕</span>;
    return <span className="text-gold-500 text-xs ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const getRowKey = (row: T, idx: number) => (rowKey ? rowKey(row) : String(idx));

  const renderCell = (col: Column<T>, row: T) => {
    if (col.render) return col.render(row);
    return String((row as Record<string, unknown>)[col.key] ?? '');
  };

  const cardCols: Column<T>[] | null = (() => {
    if (typeof mobileCardColumns === 'number') return columns.slice(0, mobileCardColumns);
    if (Array.isArray(mobileCardColumns)) return mobileCardColumns;
    return null;
  })();

  const wideColumnWidth = (col: Column<T>, index: number) => col.width || (index < 3 ? '180px' : '130px');
  const wideTableMinWidth = columns.reduce((total, col, index) => total + parsePx(wideColumnWidth(col, index)), 0);

  const renderDesktopHeader = () => (
    <thead>
      <tr>
        {columns.map((col, ci) => {
          const isSticky = ci < fixedLeft;
          return (
            <th
              key={col.key}
              className={`data-table-th ${hideClass(col.hideOn)} ${isSticky ? 'data-table-sticky-left' : ''} ${
                col.sortable && onSort ? 'cursor-pointer select-none' : ''
              }`}
              style={{
                width: horizontalScroll ? wideColumnWidth(col, ci) : col.width,
                textAlign: col.align || 'left',
                left: isSticky ? `${calcStickyLeft(columns, ci)}px` : undefined,
              }}
              onClick={() => col.sortable && onSort?.(col.key)}
            >
              {col.title}
              {col.sortable && onSort && <SortIcon field={col.key} />}
            </th>
          );
        })}
      </tr>
    </thead>
  );

  const renderDesktopBody = () => (
    <tbody>
      {data.map((row, idx) => (
        <tr
          key={getRowKey(row, idx)}
          className={`data-table-row ${onRowClick ? 'cursor-pointer' : ''}`}
          onClick={() => onRowClick?.(row)}
        >
          {columns.map((col, ci) => {
            const isSticky = ci < fixedLeft;
            return (
              <td
                key={col.key}
                className={`data-table-td ${hideClass(col.hideOn)} ${isSticky ? 'data-table-sticky-left data-table-sticky-td' : ''}`}
                style={{
                  width: horizontalScroll ? wideColumnWidth(col, ci) : col.width,
                  maxWidth: horizontalScroll ? wideColumnWidth(col, ci) : col.width,
                  textAlign: col.align || 'left',
                  left: isSticky ? `${calcStickyLeft(columns, ci)}px` : undefined,
                }}
              >
                <div className={col.truncate ? 'truncate' : ''}>
                  {renderCell(col, row)}
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );

  const wideColGroup = (
    <colgroup>
      {columns.map((col, index) => <col key={col.key} style={{ width: wideColumnWidth(col, index) }} />)}
    </colgroup>
  );

  return (
    <div className="data-table-wrapper">
      {/* ========== 桌面端：固定表头表格 ========== */}
      {horizontalScroll ? (
        <div className="hidden md:block data-table-wide">
          <div ref={headerScrollRef} className="data-table-wide-header">
            <table className="text-sm data-table table-fixed" style={{ minWidth: wideTableMinWidth, width: '100%' }}>
              {wideColGroup}
              {renderDesktopHeader()}
            </table>
          </div>
          <div ref={containerRef} className="data-table-wide-body">
            <table className="text-sm data-table table-fixed" style={{ minWidth: wideTableMinWidth, width: '100%' }}>
              {wideColGroup}
              {renderDesktopBody()}
            </table>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`hidden md:block data-table-scroll ${hasInternalScroll ? 'data-table-scroll-internal' : ''}`}
          style={hasInternalScroll ? { maxHeight, overflow: 'auto' } : undefined}
        >
          <table className={`w-full text-sm data-table ${fixedLayout ? 'table-fixed' : ''}`}>
            {renderDesktopHeader()}
            {renderDesktopBody()}
          </table>
        </div>
      )}

      {/* ========== 移动端：卡片模式（按页面显式启用） ========== */}
      {cardCols && (
        <div className="md:hidden divide-y divide-gray-100">
          {data.map((row, idx) => {
            const key = getRowKey(row, idx);
            const isSwipeOpen = openSwipeKey === key;
            const actions: SwipeAction<T>[] = mobileSwipeActions && mobileSwipeActions.length > 0
              ? mobileSwipeActions
              : onDelete && (!canDelete || canDelete(row))
                ? [{
                  label: '删除',
                  onClick: onDelete,
                  className: 'bg-red-500 text-white active:bg-red-600',
                }]
                : [];
            const swipeWidth = actions.reduce((total, action) => total + (action.width || 88), 0);
            const rowCanSwipe = actions.length > 0;
            return (
              <div key={key} className="relative overflow-hidden bg-white">
                {rowCanSwipe && (
                  <div className="absolute inset-y-0 right-0 flex" style={{ width: `${swipeWidth}px` }}>
                    {actions.map((action) => {
                      const actionLabel = typeof action.label === 'function' ? action.label(row) : action.label;
                      return (
                        <button
                          key={actionLabel}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSwipeKey(null);
                            action.onClick(row);
                          }}
                          className={`flex flex-col items-center justify-center gap-1 text-xs font-medium ${action.className || 'bg-gray-900 text-white active:bg-gray-800'}`}
                          style={{ width: `${action.width || 88}px` }}
                          aria-label={actionLabel}
                        >
                          {actionLabel === '删除' ? <Trash2 size={18} /> : null}
                          {actionLabel}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div
                  className={`px-4 py-3 bg-white active:bg-gray-50 transition-transform duration-200 ease-out ${onRowClick ? 'cursor-pointer' : ''}`}
                  style={{ transform: rowCanSwipe && isSwipeOpen ? `translateX(-${swipeWidth}px)` : 'translateX(0)' }}
                  onTouchStart={(e) => {
                    if (!rowCanSwipe) return;
                    const touch = e.touches[0];
                    touchStartRef.current = { x: touch.clientX, y: touch.clientY, key };
                  }}
                  onTouchMove={(e) => {
                    if (!rowCanSwipe || touchStartRef.current?.key !== key) return;
                    const touch = e.touches[0];
                    const dx = touch.clientX - touchStartRef.current.x;
                    const dy = touch.clientY - touchStartRef.current.y;
                    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                      if (dx < 0) setOpenSwipeKey(key);
                      if (dx > 0) setOpenSwipeKey(null);
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (!rowCanSwipe || touchStartRef.current?.key !== key) return;
                    const touch = e.changedTouches[0];
                    const dx = touch.clientX - touchStartRef.current.x;
                    const dy = touch.clientY - touchStartRef.current.y;
                    const swiped = Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.25;
                    if (swiped) {
                      suppressClickRef.current = key;
                      window.setTimeout(() => {
                        if (suppressClickRef.current === key) suppressClickRef.current = null;
                      }, 250);
                      setOpenSwipeKey(dx < 0 ? key : null);
                    }
                    touchStartRef.current = null;
                  }}
                  onClick={() => {
                    if (suppressClickRef.current === key) return;
                    if (openSwipeKey && openSwipeKey !== key) {
                      setOpenSwipeKey(null);
                      return;
                    }
                    if (isSwipeOpen) {
                      setOpenSwipeKey(null);
                      return;
                    }
                    onRowClick?.(row);
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="min-w-0 flex-1">{renderCell(cardCols[0] || columns[0], row)}</div>
                    {cardCols[1] && <div className="shrink-0">{renderCell(cardCols[1], row)}</div>}
                  </div>
                  {cardCols.slice(2).map((col) => (
                    <div key={col.key} className="mt-1">
                      {renderCell(col, row)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========== 移动端：横向滚动迷你表格 ========== */}
      {!cardCols && <div className="md:hidden data-table-mobile-scroll">
        <table className="data-table-mobile">
          <thead>
            <tr>
              {columns.map((col, ci) => {
                const isSticky = ci < mobileFixedLeft;
                return (
                  <th
                    key={col.key}
                    className={`data-table-mobile-th ${isSticky ? 'data-table-sticky-left' : ''}`}
                    style={{
                      left: isSticky ? `${calcStickyLeftMobile(columns, ci)}px` : undefined,
                    }}
                  >
                    {col.title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const key = getRowKey(row, idx);
              const isSelected = selectedKey === key;
              return (
                <tr
                  key={key}
                  className={`data-table-mobile-row ${isSelected ? 'data-table-mobile-row-selected' : ''}`}
                  onClick={() => { setSelectedKey(key); onRowClick?.(row); }}
                >
                  {columns.map((col, ci) => {
                    const isSticky = ci < mobileFixedLeft;
                    return (
                      <td
                        key={col.key}
                        className={`data-table-mobile-td ${isSticky ? 'data-table-sticky-left data-table-mobile-sticky-td' : ''}`}
                        style={{
                          left: isSticky ? `${calcStickyLeftMobile(columns, ci)}px` : undefined,
                        }}
                      >
                        {col.truncate ? (
                          <div className="truncate" style={{ maxWidth: `${mobileTruncateWidth}px` }}>
                            {renderCell(col, row)}
                          </div>
                        ) : renderCell(col, row)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

/** 计算固定列的 left 偏移值（桌面端） */
function calcStickyLeft(columns: Column<any>[], idx: number): number {
  let left = 0;
  for (let i = 0; i < idx; i++) {
    const w = columns[i].width;
    if (w) left += parsePx(w);
    else left += 120; // 默认列宽估算
  }
  return left;
}

/** 计算固定列的 left 偏移值（移动端） */
function calcStickyLeftMobile(columns: Column<any>[], idx: number): number {
  let left = 0;
  for (let i = 0; i < idx; i++) {
    const w = columns[i].width;
    if (w) left += parsePx(w);
    else left += 100;
  }
  return left;
}

function parsePx(w: string): number {
  const match = w.match(/^(\d+)px$/);
  if (match) return parseInt(match[1], 10);
  return 120;
}
