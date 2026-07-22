import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '@/assets/LOGO2.png'

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const menuItems = [
    { label: '首页', path: '/' },
    { label: '案例作品', path: '/#cases' },
    { label: '关于我们', path: '/about' },
    { label: '联系我们', path: '/#contact' },
    { label: '后台管理', path: '/admin' },
  ]

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'bg-white/90 backdrop-blur-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-12">
            {/* Logo + 公司名 */}
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <img 
                src={logo} 
                alt="品诺筑家整装" 
                className="h-10 object-contain"
              />
            </div>

            {/* 汉堡菜单按钮 */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex flex-col gap-1.5 p-1"
            >
              <span className={`block w-5 h-px transition-all duration-300 ${
                isScrolled ? 'bg-gray-800' : 'bg-white'
              } ${isMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`block w-5 h-px transition-all duration-300 ${
                isScrolled ? 'bg-gray-800' : 'bg-white'
              } ${isMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-px transition-all duration-300 ${
                isScrolled ? 'bg-gray-800' : 'bg-white'
              } ${isMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* 全屏菜单 */}
      <div className={`fixed inset-0 z-40 bg-white transition-all duration-500 ${
        isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}>
        <div className="flex flex-col items-center justify-center h-full gap-6">
          {menuItems.map((item) => (
            <button 
              key={item.label}
              onClick={() => { navigate(item.path); setIsMenuOpen(false) }}
              className="text-gray-800 text-lg tracking-widest hover:text-gray-500 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
