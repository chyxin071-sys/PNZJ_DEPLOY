import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Loader2, ChevronDown, ChevronRight, Trash2, ImagePlus, X } from 'lucide-react';
import { systemConfigsAPI } from '@/db/api';
import { cloudApp } from '@/db/cloudbase';
import { DEFAULT_TEMPLATES, buildNodesFromTemplate, makeId } from '@/config/constructionTemplates';
import { uploadFile as uploadToCloud } from '@/utils/cloudStorage';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { openNativeMediaPreview } from '@/utils/miniProgramPreview';
import { useSmartBack } from '@/hooks/useSmartBack';

const TEMPLATE_DOC_ID = 'default_project_template';
const LEGACY_TEMPLATE_DOC_ID = 'project_template';

async function saveSystemConfigDoc(id: string, payload: any) {
  try {
    const res: any = await cloudApp.callFunction({
      name: 'quickUpdateConfig',
      data: { docId: id, updateData: payload }
    });
    if (res?.result?.success) return;
    throw new Error(res?.result?.error || '云函数保存失败');
  } catch (cloudFunctionError) {
    console.warn('quickUpdateConfig save failed, falling back to direct DB write', cloudFunctionError);
  }
  try {
    await systemConfigsAPI.doc(id).set(payload);
  } catch (setError) {
    try {
      await systemConfigsAPI.doc(id).update(payload);
    } catch {
      throw setError;
    }
  }
}

async function getSystemConfigDoc(id: string) {
  try {
    const res: any = await cloudApp.callFunction({
      name: 'quickUpdateConfig',
      data: { docId: id, action: 'get' }
    });
    if (res?.result?.success) return res.result.data;
  } catch (cloudFunctionError) {
    console.warn('quickUpdateConfig get failed, falling back to direct DB read', cloudFunctionError);
  }
  return systemConfigsAPI.doc(id).get();
}

function extractTemplateNodes(doc: any) {
  const data = Array.isArray(doc?.data) ? doc.data[0] : doc?.data;
  if (data?.nodesData) return data.nodesData;
  if (doc?.nodesData) return doc.nodesData;
  return null;
}

function resolveCloudImageSrc(src?: string) {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')) return src;
  const cloudSrc = src.startsWith('cloud://')
    ? src
    : `cloud://cloud1-8grodf5s3006f004.636c-cloud1-8grodf5s3006f004-1421470557/${src}`;
  return cloudSrc.replace(/^cloud:\/\/[^.]+\.([^/]+)\//, 'https://$1.tcb.qcloud.la/');
}

function stripTemplateUiState(value: any): any {
  if (Array.isArray(value)) return value.map(stripTemplateUiState);
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, any> = {};
  Object.keys(value).forEach((key) => {
    if (key === 'collapsed' || key === 'editCollapsed' || key === 'craftCollapsed') return;
    next[key] = stripTemplateUiState(value[key]);
  });
  return next;
}

function snapshotTemplate(nodes: any[]) {
  return JSON.stringify(stripTemplateUiState(nodes));
}

export default function TemplateLibrary() {
  const smartBack = useSmartBack('/');
  const [nodes, setNodes] = useState<any[]>([]);
  const [craftPreview, setCraftPreview] = useState<{ images: string[]; index: number } | null>(null);

  const openCraftPreview = (images: string[], index: number) => {
    const resolved = images.map(resolveCloudImageSrc).filter(Boolean);
    if (resolved.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, resolved.length - 1));
    if (openNativeMediaPreview(resolved.map(url => ({ url, type: 'image' })), safeIndex)) return;
    setCraftPreview({ images: resolved, index: safeIndex });
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [uploadingCraftKey, setUploadingCraftKey] = useState<string | null>(null);
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
  const [dragOverNodeIndex, setDragOverNodeIndex] = useState<number | null>(null);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const [primaryRes, legacyRes] = await Promise.all([
        getSystemConfigDoc(TEMPLATE_DOC_ID),
        getSystemConfigDoc(LEGACY_TEMPLATE_DOC_ID),
      ]);
      const sourceNodes = extractTemplateNodes(primaryRes) || extractTemplateNodes(legacyRes);
      let nextNodes: any[];
      if (sourceNodes) {
        nextNodes = sourceNodes.map((n: any) => ({
          ...n,
          craftCollapsed: true,
          collapsed: true,
          sections: n.sections?.map((s: any) => ({ ...s, collapsed: true }))
        }));
      } else {
        nextNodes = buildNodesFromTemplate(DEFAULT_TEMPLATES[0]).map((n: any) => ({
          ...n,
          craftCollapsed: true,
          collapsed: true,
          sections: n.sections?.map((s: any) => ({ ...s, collapsed: true }))
        }));
      }
      setNodes(nextNodes);
      setSavedSnapshot(snapshotTemplate(nextNodes));
    } catch (e) {
      console.error(e);
      const nextNodes = buildNodesFromTemplate(DEFAULT_TEMPLATES[0]).map((n: any) => ({
        ...n,
        craftCollapsed: true,
        collapsed: true,
        sections: n.sections?.map((s: any) => ({ ...s, collapsed: true }))
      }));
      setNodes(nextNodes);
      setSavedSnapshot(snapshotTemplate(nextNodes));
    }
    setLoading(false);
  };

  const saveTemplate = async (currentNodes = nodes) => {
    if (saving) return;
    setSaving(true);
    try {
      const cleanNodes = stripTemplateUiState(currentNodes);
      const payload = {
        nodesData: cleanNodes,
        updatedAt: new Date().toISOString()
      };
      await saveSystemConfigDoc(TEMPLATE_DOC_ID, payload);
      try {
        await saveSystemConfigDoc(LEGACY_TEMPLATE_DOC_ID, payload);
      } catch (legacyError) {
        console.warn('Legacy template save skipped', legacyError);
      }
      setSavedSnapshot(snapshotTemplate(currentNodes));
    } catch (e) {
      console.error('Failed to save template library', e);
      alert(`保存模板库失败：${(e as any)?.message || '请稍后重试'}`);
    }
    setSaving(false);
  };

  const isDirty = snapshotTemplate(nodes) !== savedSnapshot;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleBack = () => {
    if (isDirty && !window.confirm('模板库有未保存的修改，确定放弃并返回吗？')) return;
    smartBack();
  };

  const discardChanges = () => {
    if (!window.confirm('确定放弃本次未保存的修改吗？')) return;
    setNodes(savedSnapshot ? JSON.parse(savedSnapshot) : []);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedNodeIndex(index);
    const newNodes = nodes.map(n => ({ ...n, collapsed: true }));
    setNodes(newNodes);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedNodeIndex === null) return;
    if (draggedNodeIndex !== index) {
      setDragOverNodeIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedNodeIndex === null) return;
    if (draggedNodeIndex !== index) {
      const newNodes = [...nodes];
      const draggedNode = newNodes.splice(draggedNodeIndex, 1)[0];
      newNodes.splice(index, 0, draggedNode);
      setNodes(newNodes);
    }
  };

  const handleDragEnd = () => {
    setDraggedNodeIndex(null);
    setDragOverNodeIndex(null);
  };

  const toggleNodeCollapse = (index: number) => {
    const newNodes = [...nodes];
    newNodes[index].collapsed = !newNodes[index].collapsed;
    setNodes(newNodes);
  };

  const toggleCraftCollapse = (nodeIdx: number) => {
    const newNodes = [...nodes];
    newNodes[nodeIdx].craftCollapsed = !newNodes[nodeIdx].craftCollapsed;
    setNodes(newNodes);
  };

  const toggleSectionCollapse = (nodeIdx: number, secIdx: number) => {
    const newNodes = [...nodes];
    newNodes[nodeIdx].sections[secIdx].collapsed = !newNodes[nodeIdx].sections[secIdx].collapsed;
    setNodes(newNodes);
  };

  const moveNode = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    const newNodes = [...nodes];
    const [item] = newNodes.splice(index, 1);
    newNodes.splice(target, 0, item);
    setNodes(newNodes);
  };

  const moveSection = (nodeIdx: number, secIdx: number, direction: -1 | 1) => {
    const sections = nodes[nodeIdx]?.sections || [];
    const target = secIdx + direction;
    if (target < 0 || target >= sections.length) return;
    const newNodes = [...nodes];
    const [item] = newNodes[nodeIdx].sections.splice(secIdx, 1);
    newNodes[nodeIdx].sections.splice(target, 0, item);
    setNodes(newNodes);
  };

  const moveSubNode = (nodeIdx: number, secIdx: number, subIdx: number, direction: -1 | 1) => {
    const subNodes = nodes[nodeIdx]?.sections?.[secIdx]?.subNodes || [];
    const target = subIdx + direction;
    if (target < 0 || target >= subNodes.length) return;
    const newNodes = [...nodes];
    const [item] = newNodes[nodeIdx].sections[secIdx].subNodes.splice(subIdx, 1);
    newNodes[nodeIdx].sections[secIdx].subNodes.splice(target, 0, item);
    setNodes(newNodes);
  };

  const addCraftsmanship = (nodeIdx: number) => {
    const newNodes = [...nodes];
    if (!newNodes[nodeIdx].craftsmanship) newNodes[nodeIdx].craftsmanship = [];
    newNodes[nodeIdx].craftsmanship.push({ text: '', images: [] });
    setNodes(newNodes);
  };

  const updateCraftsmanship = (nodeIdx: number, craftIdx: number, patch: Record<string, any>) => {
    const newNodes = [...nodes];
    const list = newNodes[nodeIdx].craftsmanship || [];
    list[craftIdx] = { ...list[craftIdx], ...patch };
    newNodes[nodeIdx].craftsmanship = list;
    setNodes(newNodes);
  };

  const removeCraftsmanship = (nodeIdx: number, craftIdx: number) => {
    const newNodes = [...nodes];
    newNodes[nodeIdx].craftsmanship = (newNodes[nodeIdx].craftsmanship || []).filter((_: any, i: number) => i !== craftIdx);
    setNodes(newNodes);
  };

  const uploadCraftsmanshipImages = async (nodeIdx: number, craftIdx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const key = `${nodeIdx}-${craftIdx}`;
    setUploadingCraftKey(key);
    try {
      const uploaded = await Promise.all(Array.from(files).map(file => uploadToCloud(file, `template_craftsmanship/${Date.now()}`)));
      const newNodes = [...nodes];
      const craft = newNodes[nodeIdx].craftsmanship?.[craftIdx];
      if (craft) {
        craft.images = [...(craft.images || []), ...uploaded.map(item => item.fileID)];
        setNodes(newNodes);
      }
    } catch (e: any) {
      alert('工艺标准图片上传失败：' + (e?.message || '未知错误'));
    } finally {
      setUploadingCraftKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gold-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
    <div className="erp-page max-w-[920px] mx-auto space-y-3">
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden px-3 md:px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div>
            <h1 className="text-base md:text-lg font-semibold text-gray-900">工地模板库</h1>
            <p className="hidden md:block text-xs text-gray-400 mt-0.5">编辑默认施工阶段与工序结构</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button onClick={discardChanges} className="hidden md:inline-flex px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
              放弃
            </button>
          )}
          <span className={`text-[11px] md:text-xs ${isDirty ? 'text-amber-600' : 'text-gray-400'}`}>
            {saving ? '保存中...' : isDirty ? '未保存' : '已保存'}
          </span>
          <button
            onClick={() => saveTemplate()}
            disabled={saving || !isDirty}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 text-white disabled:opacity-35 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {nodes.map((node, index) => (
          <div 
            key={node._id || index}
            className={`bg-white rounded-lg border transition-all ${
              draggedNodeIndex === index ? 'opacity-50 border-gold-400' :
              dragOverNodeIndex === index ? 'border-gold-400 border-dashed border-2' :
              'border-gray-200'
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50/50 transition-colors border-b border-gray-100">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if(confirm('确定删除该大节点及其包含的所有内容吗？')) {
                      const newNodes = [...nodes];
                      newNodes.splice(index, 1);
                      setNodes(newNodes);
                    }
                  }}
                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                  title="删除节点"
                >
                  <Trash2 size={13} />
                </button>
                <input 
                  value={node.name}
                  onChange={(e) => {
                    const newNodes = [...nodes];
                    newNodes[index].name = e.target.value;
                    setNodes(newNodes);
                  }}
                  className="min-w-0 flex-1 text-sm font-medium text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none"
                />
                <span className="hidden sm:inline-flex shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-500">
                  工艺标准 {node.craftsmanship?.length || 0}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => moveNode(index, -1)} disabled={index === 0} className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                  <button onClick={() => moveNode(index, 1)} disabled={index === nodes.length - 1} className="px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                </div>
                <button onClick={() => toggleNodeCollapse(index)} className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded">
                  {node.collapsed ? '展开' : '收起'}
                </button>
                <div className="hidden md:block cursor-grab hover:text-gold-500 text-gray-400 p-1 pl-2 border-l border-gray-200 ml-1" title="拖拽排序">
                  <span className="text-lg font-bold">≡</span>
                </div>
              </div>
            </div>

            {!node.collapsed && (
              <div className="p-3 bg-white space-y-3 border-t border-gray-100">
                <div className="rounded-lg border border-gray-100 bg-gray-50/40 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleCraftCollapse(index)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {node.craftCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      <span className="text-xs font-medium text-gray-700">
                        工艺标准 <span className="text-gray-400 font-normal">({node.craftsmanship?.length || 0})</span>
                      </span>
                    </button>
                    <button onClick={() => addCraftsmanship(index)} className="inline-flex items-center gap-1 text-[11px] text-gold-600 hover:text-gold-700">
                      <Plus size={13} /> 添加
                    </button>
                  </div>
                  {!node.craftCollapsed && ((!node.craftsmanship || node.craftsmanship.length === 0) ? (
                    <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">暂无工艺标准，可按阶段预置文字和图片。</div>
                  ) : (
                    <div className="border-t border-gray-100 p-3 space-y-2">
                      {node.craftsmanship.map((craft: any, craftIdx: number) => (
                        <div key={craftIdx} className="rounded-lg bg-white border border-gray-100 p-2">
                          <div className="flex items-center justify-end gap-2 mb-1.5">
                            <button onClick={() => removeCraftsmanship(index, craftIdx)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <textarea
                            value={craft.text || ''}
                            onChange={(e) => updateCraftsmanship(index, craftIdx, { text: e.target.value })}
                            rows={Math.min(12, Math.max(4, Math.ceil((craft.text || '').length / 28)))}
                            placeholder="输入工艺标准..."
                            className="min-h-[120px] w-full resize-y rounded-lg border border-gray-100 px-2 py-1.5 text-xs md:text-sm text-gray-700 outline-none focus:border-gold-300"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(craft.images || []).map((img: string, imgIdx: number) => (
                              <div key={`${img}-${imgIdx}`} className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-white">
                                <button type="button" onClick={() => openCraftPreview(craft.images || [], imgIdx)} className="h-full w-full">
                                  <img src={resolveCloudImageSrc(img)} alt="工艺标准图" className="h-full w-full object-cover" />
                                </button>
                                <button
                                  onClick={() => updateCraftsmanship(index, craftIdx, { images: (craft.images || []).filter((_: string, i: number) => i !== imgIdx) })}
                                  className="absolute right-0.5 top-0.5 rounded-full bg-black/45 p-0.5 text-white"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                            <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white text-[10px] text-gray-400 hover:text-gold-600">
                              <ImagePlus size={15} />
                              {uploadingCraftKey === `${index}-${craftIdx}` ? '上传中' : '图片'}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={uploadingCraftKey === `${index}-${craftIdx}`}
                                onChange={(e) => {
                                  uploadCraftsmanshipImages(index, craftIdx, e.target.files);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {/* 阶段列表 */}
                {node.sections?.map((sec: any, secIdx: number) => (
                  <div key={secIdx} className="rounded-lg border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50/60 border-b border-gray-100">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if(confirm('确定删除该阶段吗？')) {
                              const newNodes = [...nodes];
                              newNodes[index].sections.splice(secIdx, 1);
                              setNodes(newNodes);
                            }
                          }}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                          title="删除阶段"
                        >
                          <Trash2 size={12} />
                        </button>
                        <input 
                          value={sec.name}
                          onChange={(e) => {
                            const newNodes = [...nodes];
                            newNodes[index].sections[secIdx].name = e.target.value;
                            setNodes(newNodes);
                          }}
                          className="min-w-0 flex-1 text-xs md:text-sm font-medium text-gray-700 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveSection(index, secIdx, -1)} disabled={secIdx === 0} className="px-1.5 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                        <button onClick={() => moveSection(index, secIdx, 1)} disabled={secIdx === (node.sections?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] md:text-[11px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                        <button onClick={() => toggleSectionCollapse(index, secIdx)} className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-white hover:bg-gray-100 rounded">
                          {sec.collapsed ? '展开' : '收起'}
                        </button>
                      </div>
                    </div>
                    {!sec.collapsed && (
                      <div className="p-2 space-y-1">
                        {sec.subNodes?.map((sn: any, subIdx: number) => (
                          <div key={sn._id || subIdx} className="flex items-start gap-2 p-1.5 hover:bg-gray-50 rounded group">
                            <textarea 
                              value={sn.name}
                              onChange={(e) => {
                                const newNodes = [...nodes];
                                newNodes[index].sections[secIdx].subNodes[subIdx].name = e.target.value;
                                setNodes(newNodes);
                              }}
                              className="text-xs md:text-sm text-gray-700 bg-transparent border border-transparent hover:border-gray-200 focus:border-gold-400 focus:bg-white rounded px-2 py-1 outline-none flex-1 min-h-[30px] resize-none overflow-hidden"
                              rows={Math.max(2, Math.ceil((sn.name || '').length / 18))}
                              onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                              }}
                            />
                            <div className="flex shrink-0 flex-col md:flex-row items-end md:items-center gap-1">
                              <button onClick={() => moveSubNode(index, secIdx, subIdx, -1)} disabled={subIdx === 0} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">上移</button>
                              <button onClick={() => moveSubNode(index, secIdx, subIdx, 1)} disabled={subIdx === (sec.subNodes?.length || 0) - 1} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed">下移</button>
                              <button
                                onClick={() => {
                                  if(confirm('确定删除该检查项吗？')) {
                                    const newNodes = [...nodes];
                                    newNodes[index].sections[secIdx].subNodes.splice(subIdx, 1);
                                    setNodes(newNodes);
                                  }
                                }}
                                className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button 
                          onClick={() => {
                            const newNodes = [...nodes];
                            if (!newNodes[index].sections[secIdx].subNodes) newNodes[index].sections[secIdx].subNodes = [];
                            newNodes[index].sections[secIdx].subNodes.push({ _id: makeId(), name: '', status: 'pending' });
                            setNodes(newNodes);
                          }}
                          className="text-[11px] md:text-xs text-gray-500 hover:text-gold-600 flex items-center gap-1 p-2 w-full justify-center border border-dashed border-gray-200 rounded mt-2 hover:bg-gold-50 transition-colors"
                        >
                          <Plus size={14} /> 添加检查项
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                
                <button 
                  onClick={() => {
                    const newNodes = [...nodes];
                    if (!newNodes[index].sections) newNodes[index].sections = [];
                    newNodes[index].sections.push({ name: '', collapsed: false, status: 'pending', subNodes: [] });
                    setNodes(newNodes);
                  }}
                  className="w-full py-2 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus size={16} /> 添加阶段
                </button>
              </div>
            )}
          </div>
        ))}

        <button 
          onClick={() => {
            const newNodes = [...nodes];
            newNodes.push({ _id: makeId(), name: '新节点', collapsed: false, sections: [] });
            setNodes(newNodes);
          }}
          className="w-full py-3 text-xs md:text-sm font-medium text-gray-500 bg-white hover:bg-gray-50 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={16} /> 新建节点
        </button>
      </div>
    </div>
      {craftPreview && (
        <ImagePreviewModal
          images={craftPreview.images}
          index={craftPreview.index}
          onIndexChange={(index) => setCraftPreview(prev => prev ? { ...prev, index } : prev)}
          onClose={() => setCraftPreview(null)}
        />
      )}
    </>
  );
}
