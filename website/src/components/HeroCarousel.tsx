import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Case } from '@/types'

interface HeroCarouselProps {
  cases: Case[]
}

export default function HeroCarousel({ cases }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showArrows, setShowArrows] = useState(false)
  const navigate = useNavigate()

  const featuredCases = cases.filter(c => c.featured).slice(0, 4)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % featuredCases.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [featuredCases.length])

  const goToPrev = () => {
    setCurrentIndex(prev => (prev - 1 + featuredCases.length) % featuredCases.length)
  }

  const goToNext = () => {
    setCurrentIndex(prev => (prev + 1) % featuredCases.length)
  }

  const currentCase = featuredCases[currentIndex]

  if (featuredCases.length === 0) return null

  return (
    <section 
      className="relative h-screen w-full overflow-hidden"
      onMouseEnter={() => setShowArrows(true)}
      onMouseLeave={() => setShowArrows(false)}
    >
      {/* 全屏背景图片 - 可点击进入详情 */}
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={() => navigate(`/case/${currentCase?.id}`)}
      >
        {featuredCases.map((caseItem, index) => (
          <div
            key={caseItem.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src={caseItem.coverImage}
              alt={caseItem.name}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* 左右箭头 */}
      <button
        onClick={goToPrev}
        className={`absolute left-6 top-1/2 -translate-y-1/2 z-20 transition-all duration-300 ${
          showArrows ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
        }`}
      >
        <div className="w-10 h-10 border border-white/50 flex items-center justify-center hover:bg-white/10 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </div>
      </button>

      <button
        onClick={goToNext}
        className={`absolute right-6 top-1/2 -translate-y-1/2 z-20 transition-all duration-300 ${
          showArrows ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
        }`}
      >
        <div className="w-10 h-10 border border-white/50 flex items-center justify-center hover:bg-white/10 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {/* 底部居中两行文字 */}
      <div className="absolute bottom-20 left-0 right-0 text-center z-10">
        <div className={`transition-all duration-700 ${
          currentIndex === currentIndex ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          {/* 上行小字 - 小区名 */}
          <p className="text-white/70 text-xs tracking-[0.3em] uppercase mb-3">
            {currentCase?.community}
          </p>
          {/* 下行大字 - 户型+风格 */}
          <h2 className="text-white text-2xl lg:text-3xl font-light tracking-wide">
            {currentCase?.houseType} · {currentCase?.style}
          </h2>
        </div>
      </div>

      {/* 底部指示器 */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3 z-10">
        {featuredCases.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-px transition-all duration-500 ${
              index === currentIndex ? 'w-12 bg-white' : 'w-6 bg-white/30'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
