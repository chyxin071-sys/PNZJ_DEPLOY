import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  LayoutGrid, 
  Home, 
  FileText, 
  LogOut, 
  User,
  ChevronRight,
  Users,
  ExternalLink
} from 'lucide-react'
import logo from '@/assets/LOGO2.png'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const currentUser = localStorage.getItem('admin_user') || 'Admin'

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    localStorage.removeItem('admin_user')
    localStorage.removeItem('admin_token')
    navigate('/admin/login')
  }

  const menuItems = [
    { 
      id: 'cases', 
      label: '案例管理', 
      icon: LayoutGrid, 
      path: '/admin',
      description: '管理所有案例作品'
    },
    { 
      id: 'designers', 
      label: '设计师管理', 
      icon: Users, 
      path: '/admin/designers',
      description: '管理设计师信息'
    },
    { 
      id: 'about', 
      label: '关于我们', 
      icon: FileText, 
      path: '/admin/about',
      description: '编辑公司简介内容'
    },
  ]

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin' || location.pathname.startsWith('/admin/cases')
    }
    if (path === '/admin/designers') {
      return location.pathname.startsWith('/admin/designers')
    }
    return location.pathname === path
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-100">
          <img 
            src={logo} 
            alt="品诺筑家" 
            className="h-8 object-contain"
          />
        </div>

        {/* 菜单 */}
        <nav className="flex-1 py-6 px-3">
          <div className="space-y-1">
            {menuItems.map(item => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    active 
                      ? 'bg-gray-900 text-white' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-sm font-medium">{item.label}</span>
                  {active && <ChevronRight size={16} className="ml-auto" />}
                </button>
              )
            })}
          </div>
        </nav>

        {/* 底部操作区 */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          {/* 返回前台 */}
          <button
            onClick={() => window.open('/', '_blank')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <ExternalLink size={18} />
            <span className="text-sm">返回前台首页</span>
          </button>
          
          {/* 用户信息 */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-8 h-8 bg-gray-200 flex items-center justify-center rounded-full">
                <User size={16} className="text-gray-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-gray-900">{currentUser}</p>
                <p className="text-xs text-gray-500">管理员</p>
              </div>
            </button>
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg border py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <LogOut size={16} />
                  <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
