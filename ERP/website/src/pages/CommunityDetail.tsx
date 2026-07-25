import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { fetchCases } from '@/api'
import type { Case } from '@/types'

export default function CommunityDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCases()
  }, [name])

  const loadCases = async () => {
    try {
      setLoading(true)
      const data = await fetchCases()
      // 只显示已发布的案例
      const publishedCases = data.filter(c => c.status === 'published')
      const filtered = publishedCases.filter(c => c.community === decodeURIComponent(name || ''))
      setCases(filtered)
    } catch (error) {
      console.error('加载案例失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* 页面标题 */}
      <section className="pt-24 pb-12">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <button 
            onClick={() => navigate('/#cases')}
            className="text-gray-500 text-sm tracking-wider hover:text-gray-900 transition-colors mb-8"
          >
            ← 返回
          </button>
          <div className="flex items-center gap-6">
            <h1 className="text-gray-900 text-3xl font-light tracking-wide">
              {decodeURIComponent(name || '')}
            </h1>
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-500 text-sm tracking-wider">
              共 {cases.length} 个案例
            </span>
          </div>
        </div>
      </section>

      {/* 案例网格 */}
      <section className="pb-20">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          {loading ? (
            <div className="text-center py-20 text-gray-500">加载中...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {cases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  onClick={() => navigate(`/case/${caseItem.id}`)}
                  className="cursor-pointer group"
                >
                  <div className="relative overflow-hidden bg-gray-100 aspect-video mb-3">
                    <img
                      src={caseItem.coverImage}
                      alt={caseItem.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <p className="text-gray-700 text-sm font-light tracking-wide text-center">
                    {caseItem.houseType} · {caseItem.style}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
