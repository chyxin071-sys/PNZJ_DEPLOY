import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { fetchCaseById, fetchDesigners } from '@/api'
import type { Case, Designer } from '@/types'
import { Share2, Phone, Mail, User } from 'lucide-react'

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [caseItem, setCaseItem] = useState<Case | null>(null)
  const [designer, setDesigner] = useState<Designer | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [showShareToast, setShowShareToast] = useState(false)

  useEffect(() => {
    loadCase()
  }, [id])

  const loadCase = async () => {
    try {
      setLoading(true)
      const data = await fetchCaseById(id!)
      setCaseItem(data)
      
      // 如果有 designerId，获取设计师信息
      if (data.designerId) {
        const designers = await fetchDesigners()
        const matchedDesigner = designers.find((d: Designer) => d.id === data.designerId)
        setDesigner(matchedDesigner || null)
      }
    } catch (error) {
      console.error('加载案例失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const openLightbox = (index: number) => {
    setSelectedImageIndex(index)
    setIsLightboxOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeLightbox = () => {
    setIsLightboxOpen(false)
    document.body.style.overflow = ''
  }

  const goToPreviousImage = () => {
    if (!caseItem) return
    setSelectedImageIndex(prev => 
      prev === 0 ? caseItem.images.length - 1 : prev - 1
    )
  }

  const goToNextImage = () => {
    if (!caseItem) return
    setSelectedImageIndex(prev => 
      prev === caseItem.images.length - 1 ? 0 : prev + 1
    )
  }

  const handleShare = async () => {
    const shareData = {
      title: `${caseItem?.name} - 品诺筑家整装`,
      text: `查看这套${caseItem?.style}风格的装修案例`,
      url: window.location.href
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        copyToClipboard()
      }
    } else {
      copyToClipboard()
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href)
    setShowShareToast(true)
    setTimeout(() => setShowShareToast(false), 2000)
  }

  useEffect(() => {
    if (!isLightboxOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPreviousImage()
      } else if (e.key === 'ArrowRight') {
        goToNextImage()
      } else if (e.key === 'Escape') {
        closeLightbox()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen, caseItem?.images.length])

  if (loading || !caseItem) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero 全屏封面图 */}
      <section className="relative h-[80vh] w-full overflow-hidden">
        <img
          src={caseItem.coverImage}
          alt={caseItem.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        
        {/* 返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 lg:left-10 z-10 text-white/80 hover:text-white text-sm tracking-wider transition-colors"
        >
          ← 返回
        </button>

        {/* 分享按钮 */}
        <button
          onClick={handleShare}
          className="absolute top-20 right-6 lg:right-10 z-10 text-white/80 hover:text-white transition-colors"
        >
          <Share2 size={20} />
        </button>

        {/* 底部文字信息 */}
        <div className="absolute bottom-16 left-0 right-0 text-center z-10">
          <p className="text-white/70 text-xs tracking-[0.3em] uppercase mb-4">
            {caseItem.community}
          </p>
          <h1 className="text-white text-4xl lg:text-5xl font-light tracking-wide mb-4">
            {caseItem.houseType} · {caseItem.style}
          </h1>
        </div>
      </section>

      {/* 设计师信息 */}
      {designer && designer.name && (
        <section className="py-12 bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 lg:px-10">
            <div className="flex items-center gap-6">
              {designer.avatar && (
                <img
                  src={designer.avatar}
                  alt={designer.name}
                  className="w-20 h-20 rounded-full object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{designer.name}</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">本案设计师</span>
                </div>
                {designer.bio && (
                  <p className="text-sm text-gray-600 mb-3">{designer.bio}</p>
                )}
                <div className="flex flex-wrap gap-4">
                  {designer.phone && (
                    <a 
                      href={`tel:${designer.phone}`}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      <Phone size={14} />
                      <span>{designer.phone}</span>
                    </a>
                  )}
                  {designer.email && (
                    <a 
                      href={`mailto:${designer.email}`}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      <Mail size={14} />
                      <span>{designer.email}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 项目信息 */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <h2 className="text-gray-900 text-2xl font-light tracking-wide mb-8">
            项目介绍
          </h2>
          <div className="w-12 h-px bg-gray-300 mx-auto mb-8" />
          <p className="text-gray-600 text-base leading-relaxed font-light whitespace-pre-wrap">
            {caseItem.description}
          </p>
          
          {/* 信息栏 */}
          <div className="flex justify-center gap-12 mt-12 pt-12 border-t border-gray-100">
            <div>
              <p className="text-gray-400 text-xs tracking-widest uppercase mb-2">小区</p>
              <p className="text-gray-800 text-sm">{caseItem.community}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs tracking-widest uppercase mb-2">面积</p>
              <p className="text-gray-800 text-sm">{caseItem.houseType}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs tracking-widest uppercase mb-2">风格</p>
              <p className="text-gray-800 text-sm">{caseItem.style}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 效果图展示 */}
      <section className="pb-20">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <h2 className="text-gray-900 text-2xl font-light tracking-wide text-center mb-4">
            效果图展示
          </h2>
          <div className="w-12 h-px bg-gray-300 mx-auto mb-12" />

          <div className="space-y-24">
            {caseItem.images.map((image, index) => {
              const isEven = index % 2 === 0
              return (
                <div
                  key={image.id}
                  className={`flex flex-col lg:flex-row items-center gap-10 lg:gap-16 ${
                    isEven ? '' : 'lg:flex-row-reverse'
                  }`}
                >
                  {/* 图片 */}
                  <div
                    onClick={() => openLightbox(index)}
                    className="cursor-pointer group relative overflow-hidden bg-gray-100 w-full lg:w-[65%] aspect-video flex-shrink-0"
                  >
                    <img
                      src={image.url}
                      alt={image.alt || ''}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  {/* 文字 */}
                  <div className="w-full lg:w-[35%] text-center lg:text-left">
                    <p className="text-gray-400 text-xs tracking-[0.3em] uppercase mb-4">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <h3 className="text-gray-900 text-xl font-light tracking-wide mb-4">
                      {image.alt || '空间展示'}
                    </h3>
                    <div className="w-8 h-px bg-gray-300 mx-auto lg:mx-0 mb-6" />
                    <p className="text-gray-500 text-sm leading-relaxed font-light whitespace-pre-wrap">
                      {caseItem.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 底部联系信息 */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <div className="w-12 h-12 bg-white flex items-center justify-center mx-auto mb-6">
            <span className="text-gray-900 font-bold text-lg">P</span>
          </div>
          <h3 className="text-xl font-light tracking-wide mb-2">品诺筑家整装</h3>
          <p className="text-gray-400 text-sm mb-8">品诺有心，筑家有道</p>
          
          <div className="flex justify-center gap-8 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Phone size={14} />
              <span>138-0000-0000</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail size={14} />
              <span>info@pinuozhujia.com</span>
            </div>
          </div>
          
          <p className="text-gray-500 text-xs mt-12">
            © 2024 品诺筑家整装 版权所有
          </p>
        </div>
      </section>

      <Footer />

      {/* 分享提示 */}
      {showShareToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-lg z-50">
          链接已复制到剪贴板
        </div>
      )}

      {/* 图片灯箱 */}
      {isLightboxOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => { e.stopPropagation(); goToPreviousImage() }}
            className="absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10"
          >
            <div className="w-12 h-12 border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </div>
          </button>

          <img
            src={caseItem.images[selectedImageIndex]?.url}
            alt=""
            className="max-w-[90vw] max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            onClick={(e) => { e.stopPropagation(); goToNextImage() }}
            className="absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors z-10"
          >
            <div className="w-12 h-12 border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="absolute bottom-8 left-0 right-0 text-center text-white/50 text-sm">
            {selectedImageIndex + 1} / {caseItem.images.length}
          </div>
        </div>
      )}
    </div>
  )
}
