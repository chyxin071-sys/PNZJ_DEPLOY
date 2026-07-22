import { useState, useEffect } from 'react'
import { fetchCases } from '@/api'
import type { Case } from '@/types'
import Navigation from '@/components/Navigation'
import HeroCarousel from '@/components/HeroCarousel'
import CommunityGallery from '@/components/CommunityGallery'
import Footer from '@/components/Footer'

export default function Home() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadCases = async () => {
      try {
        const data = await fetchCases()
        // 只显示已发布的案例
        const publishedCases = data.filter(c => c.status === 'published')
        setCases(publishedCases)
      } catch (error) {
        console.error('Failed to load cases:', error)
      } finally {
        setLoading(false)
      }
    }
    loadCases()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border border-brand-amber flex items-center justify-center">
            <span className="text-xl font-light tracking-widest text-brand-amber">P</span>
          </div>
          <div className="text-gray-500 text-xs tracking-[0.2em] uppercase">加载中</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <HeroCarousel cases={cases} />
      <div id="cases">
        <CommunityGallery cases={cases} />
      </div>
      <Footer />
    </div>
  )
}
