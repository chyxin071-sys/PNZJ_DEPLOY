import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import logo from '@/assets/LOGO2.png'
import { loginAdmin } from '@/api'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await loginAdmin(username, password)
      localStorage.setItem('admin_logged_in', 'true')
      localStorage.setItem('admin_user', result.username)
      localStorage.setItem('admin_token', result.token)
      navigate('/admin')
    } catch {
      setError('用户名或密码错误')
    }

    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent, nextField?: 'password' | 'submit') => {
    if (e.key === 'Enter') {
      if (nextField === 'password') {
        passwordRef.current?.focus()
      } else if (nextField === 'submit') {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={18} />
        <span>返回网站</span>
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src={logo} 
            alt="品诺筑家" 
            className="h-16 object-contain mx-auto mb-4"
          />
          <p className="text-sm text-gray-500 mt-1">后台管理系统</p>
        </div>

        {/* 登录表单 */}
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'password')}
                className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                密码
              </label>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, 'submit')}
                className="w-full px-4 py-3 border border-gray-200 text-sm focus:outline-none focus:border-gray-400 transition-colors"
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2024 品诺筑家整装
        </p>
      </div>
    </div>
  )
}
