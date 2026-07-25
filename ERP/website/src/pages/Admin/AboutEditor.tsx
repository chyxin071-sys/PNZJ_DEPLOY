import { useState, useEffect } from 'react'
import { Save, Eye, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from './AdminLayout'

interface AboutContent {
  companyName: string
  tagline: string
  description: string[]
  stats: { label: string; value: string }[]
  serviceConcepts: { title: string; description: string }[]
}

const defaultContent: AboutContent = {
  companyName: '品诺筑家整装',
  tagline: '品诺有心，筑家有道',
  description: [
    '品诺筑家整装成立于2015年，是一家专注于高端住宅室内设计与整装服务的专业公司。我们秉承"品诺有心，筑家有道"的理念，致力于为每一位业主打造独一无二的理想居所。',
    '公司拥有资深设计师团队30余人，累计服务超过2000个家庭，涵盖现代简约、新中式、轻奢、北欧等多种风格。我们坚持原创设计，注重空间功能与美学的完美融合，让每一处细节都体现生活品质。',
    '从方案设计到施工落地，我们提供一站式整装服务，严格把控每一个环节，确保设计理念得以精准呈现。'
  ],
  stats: [
    { label: '年行业经验', value: '9+' },
    { label: '服务家庭', value: '2000+' },
    { label: '资深设计师', value: '30+' },
    { label: '合作小区', value: '50+' }
  ],
  serviceConcepts: [
    {
      title: '原创设计',
      description: '拒绝千篇一律的模板化设计，每个案例都是根据业主需求量身定制'
    },
    {
      title: '品质施工',
      description: '严选环保材料，标准化施工流程，确保每一个环节都经得起检验'
    },
    {
      title: '全程服务',
      description: '从设计咨询到售后保障，专业团队全程跟进，让您省心无忧'
    }
  ]
}

export default function AboutEditor() {
  const navigate = useNavigate()
  const [content, setContent] = useState<AboutContent>(defaultContent)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const savedContent = localStorage.getItem('about_content')
    if (savedContent) {
      setContent(JSON.parse(savedContent))
    }
  }, [])

  const handleSave = () => {
    setSaving(true)
    localStorage.setItem('about_content', JSON.stringify(content))
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 500)
  }

  const updateDescription = (index: number, value: string) => {
    const newDesc = [...content.description]
    newDesc[index] = value
    setContent({ ...content, description: newDesc })
  }

  const updateStat = (index: number, field: 'label' | 'value', value: string) => {
    const newStats = [...content.stats]
    newStats[index] = { ...newStats[index], [field]: value }
    setContent({ ...content, stats: newStats })
  }

  const updateConcept = (index: number, field: 'title' | 'description', value: string) => {
    const newConcepts = [...content.serviceConcepts]
    newConcepts[index] = { ...newConcepts[index], [field]: value }
    setContent({ ...content, serviceConcepts: newConcepts })
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-100">
        {/* 顶部导航 */}
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div>
                <h1 className="font-medium text-gray-900">关于我们</h1>
                <p className="text-xs text-gray-500">编辑公司简介内容</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/about')}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Eye size={18} />
                  <span>预览</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Save size={18} />
                  <span>{saving ? '保存中...' : saved ? '已保存' : '保存'}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
          <div className="space-y-8">
            {/* 公司名称 */}
            <div className="bg-white rounded-lg p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4">基本信息</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">公司名称</label>
                  <input
                    type="text"
                    value={content.companyName}
                    onChange={(e) => setContent({ ...content, companyName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2">品牌口号</label>
                  <input
                    type="text"
                    value={content.tagline}
                    onChange={(e) => setContent({ ...content, tagline: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* 公司简介 */}
            <div className="bg-white rounded-lg p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4">公司简介</h2>
              <div className="space-y-4">
                {content.description.map((desc, index) => (
                  <div key={index}>
                    <label className="block text-sm text-gray-600 mb-2">段落 {index + 1}</label>
                    <textarea
                      value={desc}
                      onChange={(e) => updateDescription(index, e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none whitespace-pre-wrap"
                      placeholder="请输入公司简介内容..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 数据统计 */}
            <div className="bg-white rounded-lg p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4">数据统计</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {content.stats.map((stat, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="mb-3">
                      <label className="block text-sm text-gray-600 mb-1">数值</label>
                      <input
                        type="text"
                        value={stat.value}
                        onChange={(e) => updateStat(index, 'value', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="如: 9+"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">标签</label>
                      <input
                        type="text"
                        value={stat.label}
                        onChange={(e) => updateStat(index, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="如: 年行业经验"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 服务理念 */}
            <div className="bg-white rounded-lg p-6">
              <h2 className="text-sm font-medium text-gray-900 mb-4">服务理念</h2>
              <div className="space-y-4">
                {content.serviceConcepts.map((concept, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="mb-3">
                      <label className="block text-sm text-gray-600 mb-1">标题</label>
                      <input
                        type="text"
                        value={concept.title}
                        onChange={(e) => updateConcept(index, 'title', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        placeholder="如: 原创设计"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">描述</label>
                      <textarea
                        value={concept.description}
                        onChange={(e) => updateConcept(index, 'description', e.target.value)}
                        rows={2}
                        className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none"
                        placeholder="请输入服务理念描述..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
