import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Case, Community } from '@/types'
import { fetchCommunities } from '@/api'

interface CommunityGalleryProps {
  cases: Case[]
}

export default function CommunityGallery({ cases }: CommunityGalleryProps) {
  const navigate = useNavigate()
  const scrollRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCommunities()
  }, [])

  const loadCommunities = async () => {
    try {
      const data = await fetchCommunities()
      // 只显示在首页展示的小区，按 sortOrder 排序
      const visibleCommunities = data
        .filter(c => c.showOnHome)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      setCommunities(visibleCommunities)
    } catch (error) {
      console.error('Failed to load communities:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDisplayCases = (communityName: string) => {
    return cases.filter(c => c.community === communityName).slice(0, 8)
  }

  const scroll = (community: string, direction: 'left' | 'right') => {
    const el = scrollRefs.current.get(community)
    if (!el) return
    const scrollAmount = direction === 'left' ? -400 : 400
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }

  if (loading) {
    return null
  }

  return (
    <section id="cases" className="py-20 bg-white">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
        {communities.map((community) => {
          const displayCases = getDisplayCases(community.name)
          if (displayCases.length === 0) return null
          
          return (
            <div key={community.id} className="mb-20 last:mb-0">
              {/* 小区标题栏 */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <h2 className="text-gray-900 text-xl font-light tracking-wide">{community.name}</h2>
                  <div className="w-20 h-px bg-gray-300" />
                </div>
                <div className="flex items-center gap-4">
                  {/* 左右滚动按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => scroll(community.name, 'left')}
                      className="w-8 h-8 border border-gray-300 flex items-center justify-center hover:border-gray-500 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => scroll(community.name, 'right')}
                      className="w-8 h-8 border border-gray-300 flex items-center justify-center hover:border-gray-500 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => navigate(`/community/${encodeURIComponent(community.name)}`)}
                    className="text-gray-500 text-sm tracking-wider hover:text-gray-900 transition-colors"
                  >
                    查看更多 →
                  </button>
                </div>
              </div>

              {/* 横向滚动卡片 */}
              <div
                ref={(el) => {
                  if (el) scrollRefs.current.set(community.name, el)
                }}
                className="flex gap-5 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {displayCases.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    onClick={() => navigate(`/case/${caseItem.id}`)}
                    className="cursor-pointer group flex-shrink-0"
                    style={{ width: 'calc((100% - 40px) / 3)' }}
                  >
                    {/* 图片 */}
                    <div className="relative overflow-hidden bg-gray-100 aspect-video mb-3">
                      <img
                        src={caseItem.coverImage}
                        alt={caseItem.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                    {/* 文字 */}
                    <p className="text-gray-700 text-sm font-light tracking-wide text-center">
                      {caseItem.houseType} · {caseItem.style}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
