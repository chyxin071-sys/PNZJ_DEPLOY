import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Plus, Edit3, Trash2, Upload, X, User, Save, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchDesigners, createDesigner, updateDesigner, deleteDesigner, uploadImage } from '@/api'
import type { Designer } from '@/types'
import AdminLayout from './AdminLayout'

export default function Designers() {
  const navigate = useNavigate()
  const [designers, setDesigners] = useState<Designer[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    avatar: '',
    bio: '',
    phone: '',
    email: ''
  })
  
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDesigners()
  }, [])

  const loadDesigners = async () => {
    try {
      const data = await fetchDesigners()
      setDesigners(data)
    } catch (error) {
      console.error('Failed to load designers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await uploadImage(file)
      setFormData(prev => ({ ...prev, avatar: result.url }))
    } catch (error) {
      console.error('Failed to upload:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      avatar: '',
      bio: '',
      phone: '',
      email: ''
    })
    setIsCreating(false)
    setEditingId(null)
  }

  const handleEdit = (designer: Designer) => {
    setFormData({
      name: designer.name,
      avatar: designer.avatar,
      bio: designer.bio,
      phone: designer.phone,
      email: designer.email
    })
    setEditingId(designer.id)
    setIsCreating(false)
  }

  const handleCreate = () => {
    resetForm()
    setIsCreating(true)
  }

  const handleSubmit = async () => {
    if (!formData.name) {
      alert('请填写设计师姓名')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateDesigner(editingId, formData)
      } else {
        await createDesigner(formData)
      }
      await loadDesigners()
      resetForm()
    } catch (error) {
      console.error('Failed to save:', error)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteDesigner(id)
      setDesigners(designers.filter(d => d.id !== id))
      setDeleteConfirm(null)
    } catch (error: any) {
      console.error('Failed to delete:', error)
      if (error.response?.data?.error === 'Cannot delete designer with existing cases') {
        alert('该设计师仍有案例关联，无法删除')
      } else {
        alert('删除失败')
      }
    }
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-100">
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
                  <h1 className="font-medium text-gray-900">设计师管理</h1>
                  <p className="text-xs text-gray-500">共 {designers.length} 位设计师</p>
                </div>
              </div>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 text-sm hover:bg-gray-800 transition-colors"
              >
                <Plus size={18} />
                <span>添加设计师</span>
              </button>
            </div>
          </div>
        </header>

        {/* 内容区域 */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* 创建/编辑表单 */}
          {(isCreating || editingId) && (
            <div className="bg-white rounded-lg p-6 mb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                {editingId ? '编辑设计师' : '添加设计师'}
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* 头像 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">头像</label>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  {formData.avatar ? (
                    <div className="relative">
                      <img
                        src={formData.avatar}
                        alt="设计师头像"
                        className="w-32 h-32 rounded-full object-cover"
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 p-2 bg-white rounded-full shadow hover:bg-gray-100 transition-colors"
                      >
                        <Upload size={14} />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => avatarInputRef.current?.click()}
                      className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
                    >
                      <User size={32} className="text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">上传头像</span>
                    </div>
                  )}
                </div>

                {/* 基本信息 */}
                <div className="lg:col-span-3 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        姓名 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="例如：李明"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="例如：138-0000-0001"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                      placeholder="例如：liming@pinuozhujia.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">简介</label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none whitespace-pre-wrap"
                      placeholder="介绍设计师的专业背景、擅长风格等..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      取消
                    </button>
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
            </div>
          )}

          {/* 设计师列表 */}
          {loading ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : designers.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">暂无设计师</p>
              <button
                onClick={handleCreate}
                className="text-sm text-black hover:underline"
              >
                添加第一位设计师
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {designers.map((designer) => (
                <div 
                  key={designer.id}
                  className="bg-white rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      {designer.avatar ? (
                        <img
                          src={designer.avatar}
                          alt={designer.name}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                          <User size={24} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">{designer.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {designer.casesCount || 0} 个案例
                        </p>
                      </div>
                    </div>

                    {designer.bio && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{designer.bio}</p>
                    )}

                    <div className="space-y-2 text-sm text-gray-500 mb-4">
                      {designer.phone && (
                        <p>电话：{designer.phone}</p>
                      )}
                      {designer.email && (
                        <p>邮箱：{designer.email}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => handleEdit(designer)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                      >
                        <Edit3 size={14} />
                        <span>编辑</span>
                      </button>
                      {deleteConfirm === designer.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(designer.id)}
                            className="flex-1 px-3 py-2 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex-1 px-3 py-2 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(designer.id)}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                          disabled={(designer.casesCount || 0) > 0}
                          title={(designer.casesCount || 0) > 0 ? '该设计师仍有案例关联，无法删除' : '删除'}
                        >
                          <Trash2 size={14} />
                          <span>删除</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </AdminLayout>
  )
}
