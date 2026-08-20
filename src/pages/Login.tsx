import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import logoUrl from '@/assets/logo.png';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoggedIn } = useAuthStore();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showContact, setShowContact] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const returnPath = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
    ? location.state.from
    : '/';

  useEffect(() => {
    if (isLoggedIn) {
      navigate(returnPath, { replace: true });
    }
  }, [isLoggedIn, navigate, returnPath]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    setLoading(true);
    try {
      const success = await login(account, password);
      if (success) {
        navigate(returnPath, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* 左侧大图 / 品牌区域 */}
      <div className="hidden md:flex w-1/2 bg-gradient-to-br from-[#0f0f0f] to-[#1a1a1a] p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="品诺筑家" className="w-12 h-12 object-contain" />
            <h1 className="text-white text-3xl font-light tracking-widest">品诺筑家</h1>
          </div>
          <div className="w-12 h-px bg-amber-400/40 mt-6"></div>
        </div>
        
        <div className="relative z-10">
          <h2 className="text-white/80 text-4xl font-light leading-snug">
            品诺有心，<br />
            <span className="text-white font-medium">筑家有道。</span>
          </h2>
          <p className="text-white/50 mt-6 font-light tracking-wide text-sm">
            轻量化整装全链路管理系统 V1.0
          </p>
        </div>

        {/* 装饰性几何图形 */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/4 -right-32 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl"></div>
      </div>

      {/* 右侧登录表单 */}
      <div className="w-full flex-1 md:w-1/2 flex items-center justify-center p-8 md:p-24 bg-white relative">
        <div className="w-full max-w-md">
          {/* 移动端 Logo */}
          <div className="md:hidden mb-8 text-center">
            <img src={logoUrl} alt="品诺筑家" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-light tracking-widest text-zinc-900 mb-1">品诺筑家</h1>
            <p className="text-sm text-zinc-500 tracking-wide">品诺有心，筑家有道</p>
          </div>

          <h3 className="text-2xl font-light mb-8 text-zinc-900">
            登录系统
          </h3>

          <form onSubmit={handleLogin} className="space-y-8">
            {error && (
              <div className="p-3 bg-rose-50 text-rose-600 text-sm text-center font-light rounded border border-rose-100">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
                账号 / 手机号
              </label>
              <input
                type="text"
                placeholder="请输入您的账号"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    passwordInputRef.current?.focus();
                  }
                }}
                className="w-full border-b-2 border-zinc-200 py-3 bg-transparent text-zinc-900 focus:outline-none focus:border-amber-400 transition-colors placeholder:text-zinc-300 font-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 uppercase tracking-widest font-medium">
                密码
              </label>
              <input
                ref={passwordInputRef}
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-b-2 border-zinc-200 py-3 bg-transparent text-zinc-900 focus:outline-none focus:border-amber-400 transition-colors placeholder:text-zinc-300 font-light"
                onKeyDown={e => e.key === 'Enter' && handleLogin(e)}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="group flex items-center justify-between w-full bg-[#0f0f0f] text-white px-6 py-4 hover:bg-[#1a1a1a] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed rounded shadow-lg shadow-black/10"
              >
                {loading ? (
                  <span className="font-light tracking-widest text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    登录中...
                  </span>
                ) : (
                  <>
                    <span className="font-light tracking-widest text-sm">登录进入系统</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-12 text-center">
            <button
              type="button"
              onClick={() => setShowContact(true)}
              className="text-xs text-zinc-400 font-light hover:text-zinc-600 transition-colors"
            >
              遇到登录问题？请联系系统管理员
            </button>
          </div>
        </div>
      </div>

      {/* 联系管理员弹窗 */}
      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            onClick={() => setShowContact(false)}
          />
          <div className="relative bg-white w-full max-w-sm rounded shadow-xl overflow-hidden">
            <button 
              onClick={() => setShowContact(false)}
              className="absolute right-4 top-4 p-2 text-zinc-400 hover:text-zinc-600 bg-zinc-50 hover:bg-zinc-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-8">
              <div className="text-center mb-6">
                <h3 className="text-xl font-medium text-zinc-900">联系管理员</h3>
                <p className="text-sm text-zinc-500 mt-2">请添加下方微信以获取账号或重置密码</p>
              </div>

              <div className="flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-amber-50 rounded flex items-center justify-center mb-6 rotate-3 border border-amber-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 -rotate-3">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                
                <div className="bg-zinc-50 w-full rounded p-4 text-center mb-8 border border-zinc-100">
                  <div className="text-2xl font-light tracking-wider text-zinc-900 select-all">
                    chyxinxin222
                  </div>
                  <div className="text-xs text-zinc-400 mt-2 font-light">长按上方微信号可复制</div>
                </div>

                <button 
                  onClick={() => setShowContact(false)}
                  className="w-full py-3.5 bg-[#0f0f0f] hover:bg-[#1a1a1a] text-white rounded transition-all duration-200 font-medium text-sm shadow-sm"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
