import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, X, Image, Save, Eye, LogOut, User, Star } from 'lucide-react'
import { createCase, updateCase, fetchCaseById, fetchDesigners, fetchCommunities, uploadImage, addCaseImage, deleteCaseImage } from '@/api'
import type { Case, CreateCaseRequest, CaseImage, Designer, Community } from '@/types'
import AdminLayout from './AdminLayout'

export default function CaseForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [designers, setDesigners] = useState<Designer[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  
  const [formData, setFormData] = useState<CreateCaseRequest>({
    name: '',
    community: '',
    houseType: '',
    style: '',
    area: 0,
    description: '',
    coverImage: '',
    featured: false,
    status: 'draft',
    designerId: ''
  })
  
  const [images, setImages] = useState<CaseImage[]>([])
  const [originalImages, setOriginalImages] = useState<CaseImage[]>([])
  
  const coverInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDesigners()
    loadCommunities()
    if (isEdit && id) {
      loadCase(id)
    }
  }, [id])

  const loadDesigners = async () => {
    try {
      const data = await fetchDesigners()
      setDesigners(data)
    } catch (error) {
      console.error('Failed to load designers:', error)
    }
  }

  const loadCommunities = async () => {
    try {
      const data = await fetchCommunities()
      setCommunities(data)
    } catch (error) {
      console.error('Failed to load communities:', error)
    }
  }

  const loadCase = async (caseId: string) => {
    try {
      const data = await fetchCaseById(caseId)
      setFormData({
        name: data.name,
        community: data.community,
        houseType: data.houseType,
        style: data.style,
        area: data.area,
        description: data.description,
        coverImage: data.coverImage,
        featured: data.featured,
        status: data.status,
        designerId: data.designerId || ''
      })
      setImages(data.images)
      setOriginalImages(data.images)
    } catch (error) {
      console.error('Failed to load case:', error)
    }
  }

  const updateFormData = (updates: Partial<CreateCaseRequest>) => {
    setFormData(prev => ({ ...prev, ...updates }))
    setHasChanges(true)
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploadImage(file)
      updateFormData({ coverImage: result.url })
    } catch (error) {
      console.error('Failed to upload:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const result = await uploadImage(file)
        const newImage: CaseImage = {
          id: `new-${Date.now()}-${Math.random()}`,
          caseId: id || '',
          url: result.url,
          order: images.length,
          alt: ''
        }
        setImages(prev => [...prev, newImage])
        setHasChanges(true)
      }
    } catch (error) {
      console.error('Failed to upload:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveCover = () => {
    updateFormData({ coverImage: '' })
  }

  const handleRemoveImage = async (imageId: string) => {
    const image = images.find(img => img.id === imageId)
    if (!image) return
    
    if (isEdit && !imageId.startsWith('new-') && id) {
      try {
        await deleteCaseImage(id, imageId)
      } catch (error) {
        console.error('Failed to delete image:', error)
      }
    }
    
    setImages(prev => prev.filter(img => img.id !== imageId))
    setHasChanges(true)
  }

  const handleImageAltChange = (imageId: string, alt: string) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, alt } : img
    ))
    setHasChanges(true)
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.community || !formData.houseType || !formData.style) {
      alert('请填写必填项')
      return
    }

    setSaving(true)
    try {
      let caseId = id

      if (isEdit && id) {
        await updateCase(id, formData)
      } else {
        const newCase = await createCase(formData)
        caseId = newCase.id
      }

      if (caseId) {
        for (const img of images) {
          if (img.id.startsWith('new-')) {
            await addCaseImage(caseId, img.url, img.alt)
          }
        }
      }

      navigate('/admin')
    } catch (error) {
      console.error('Failed to save:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    localStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  const selectedDesigner = designers.find(d => d.id === formData.designerId)
  const styles = ['现代简约', '新中式', '轻奢美式', '北欧风格', '轻奢风格', '田园风格', '欧式古典', '日式原木', '法式轻奢', '地中海', '美式乡村', '工业风']

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigate('/admin')}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                >
                  <ArrowLeft size={20} className="text-gray-600" />
                </button>
                <div>
                  <h1 className="font-medium text-gray-900">{isEdit ? '编辑案例' : '新建案例'}</h1>
                  <p className="text-xs text-gray-500">{isEdit ? '修改案例信息' : '创建新的设计案例'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isEdit && id && (
                  <button
                    onClick={() => navigate(`/case/${id}`)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <Eye size={18} />
                    <span>预览</span>
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 bg-black text-white px-4 py-2 text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  <Save size={18} />
                  <span>{saving ? '保存中...' : '保存'}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* 内容区域 */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 左侧 - 基本信息 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 基本信息 */}
              <div className="bg-white rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">基本信息</h2>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      案例名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateFormData({ name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                      placeholder="例如：南湖国际C区 110㎡ 现代简约"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        小区名称 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.community}
                        onChange={(e) => updateFormData({ community: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                      >
                        <option value="">请选择小区</option>
                        {communities.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        <a 
                          href="/admin/featured" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          管理小区列表
                        </a>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        户型 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.houseType}
                        onChange={(e) => updateFormData({ houseType: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="例如：110㎡ 三室两厅"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        风格 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.style}
                        onChange={(e) => updateFormData({ style: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                      >
                        <option value="">请选择风格</option>
                        {styles.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        面积（㎡）
                      </label>
                      <input
                        type="number"
                        value={formData.area || ''}
                        onChange={(e) => updateFormData({ area: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="例如：110"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      设计说明
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => updateFormData({ description: e.target.value })}
                      rows={5}
                      className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none whitespace-pre-wrap"
                      placeholder="描述本案的设计理念、空间布局、材质选择等..."
                    />
                  </div>
                </div>
              </div>

              {/* 设计师信息 */}
              <div className="bg-white rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">设计师信息</h2>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        选择设计师
                      </label>
                      <select
                        value={formData.designerId || ''}
                        onChange={(e) => updateFormData({ designerId: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors bg-white"
                      >
                        <option value="">请选择设计师</option>
                        {designers.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        <a 
                          href="/admin/designers" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          管理设计师
                        </a>
                      </p>
                    </div>
                  </div>
                  
                  {/* 选中设计师的预览信息 */}
                  {selectedDesigner && (
                    <div className="flex items-start gap-6 p-4 bg-gray-50 rounded-lg">
                      {selectedDesigner.avatar ? (
                        <img
                          src={selectedDesigner.avatar}
                          alt={selectedDesigner.name}
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                          <User size={24} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{selectedDesigner.name}</h3>
                        {selectedDesigner.bio && (
                          <p className="text-sm text-gray-600 mt-1">{selectedDesigner.bio}</p>
                        )}
                        {selectedDesigner.phone && (
                          <p className="text-sm text-gray-500 mt-1">电话：{selectedDesigner.phone}</p>
                        )}
                        {selectedDesigner.email && (
                          <p className="text-sm text-gray-500">邮箱：{selectedDesigner.email}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 效果图集 */}
              <div className="bg-white rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-medium text-gray-900">效果图集</h2>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  >
                    <Upload size={16} />
                    <span>{uploading ? '上传中...' : '添加图片'}</span>
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                {images.length === 0 ? (
                  <div 
                    onClick={() => imageInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-lg p-12 text-center cursor-pointer hover:border-gray-300 transition-colors"
                  >
                    <Image size={32} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 text-sm">点击添加效果图</p>
                    <p className="text-gray-400 text-xs mt-1">支持 JPG, PNG 格式</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {images.map((img, index) => (
                      <div key={img.id} className="relative group bg-gray-50 rounded-lg overflow-hidden">
                        <div className="aspect-video">
                          <img
                            src={img.url}
                            alt={img.alt || ''}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleRemoveImage(img.id)}
                            className="p-1.5 bg-white rounded shadow hover:bg-gray-100 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="p-3">
                          <p className="text-xs text-gray-500 mb-2">图片 {index + 1}</p>
                          <textarea
                            value={img.alt || ''}
                            onChange={(e) => handleImageAltChange(img.id, e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:border-gray-400 resize-none"
                            placeholder="添加描述（如：客厅、餐厅、主卧等）"
                          />
                        </div>
                      </div>
                    ))}
                    <div 
                      onClick={() => imageInputRef.current?.click()}
                      className="aspect-video border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 transition-colors"
                    >
                      <Upload size={24} className="text-gray-400 mb-2" />
                      <p className="text-gray-500 text-sm">添加更多</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧 - 设置 */}
            <div className="space-y-6">
              {/* 发布设置 */}
              <div className="bg-white rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">发布设置</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">案例状态</p>
                      <p className="text-xs text-gray-500">
                        {formData.status === 'published' ? '已发布，前台可见' : '草稿，仅后台可见'}
                      </p>
                    </div>
                    <button
                      onClick={() => updateFormData({ status: formData.status === 'published' ? 'draft' : 'published' })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        formData.status === 'published' ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span 
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          formData.status === 'published' ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">首页推荐</p>
                      <p className="text-xs text-gray-500">显示在首页轮播</p>
                    </div>
                    <button
                      onClick={() => updateFormData({ featured: !formData.featured })}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        formData.featured ? 'bg-amber-500' : 'bg-gray-300'
                      }`}
                    >
                      <Star 
                        size={12} 
                        className={`absolute top-1.5 text-white ${
                          formData.featured ? 'left-7' : 'left-1.5'
                        }`} 
                        fill={formData.featured ? 'white' : 'none'}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* 封面图 */}
              <div className="bg-white rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-6">封面图片</h2>
                
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />

                {formData.coverImage ? (
                  <div className="relative">
                    <div className="aspect-video rounded-lg overflow-hidden">
                      <img
                        src={formData.coverImage}
                        alt="封面"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => coverInputRef.current?.click()}
                        className="p-2 bg-white rounded shadow hover:bg-gray-100 transition-colors"
                        title="更换图片"
                      >
                        <Upload size={14} />
                      </button>
                      <button
                        onClick={handleRemoveCover}
                        className="p-2 bg-white rounded shadow hover:bg-gray-100 transition-colors"
                        title="删除"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => coverInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-gray-300 transition-colors"
                  >
                    <Image size={32} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-600 text-sm">上传封面图片</p>
                    <p className="text-gray-400 text-xs mt-1">建议尺寸 1920x1080</p>
                  </div>
                )}
              </div>

              {/* 填写提示 */}
              <div className="bg-white rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">填写提示</h2>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">*</span>
                    <span>标记的为必填项</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>案例名称建议包含小区名、户型、风格</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>效果图请添加空间描述，方便前台展示</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>设为草稿的案例不会在前台显示</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AdminLayout>
  )
}
