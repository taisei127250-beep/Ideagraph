import { useState } from 'react';

export default function AuthScreen({ onGoogleLogin, onEmailLogin, onEmailSignUp, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    setError('');
    try {
      if (isSignUp) {
        await onEmailSignUp(email, password);
      } else {
        await onEmailLogin(email, password);
      }
    } catch (err) {
      setError(err.message || '認証エラーが発生しました');
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await onGoogleLogin();
    } catch (err) {
      setError(err.message || 'Googleログインに失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧠</div>
          <h1 className="text-2xl font-bold text-slate-100">IdeaGraph</h1>
          <p className="text-slate-400 mt-2 text-sm">書くだけでアイデアがつながる</p>
        </div>

        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors duration-200 mb-6"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {loading ? 'ログイン中...' : 'Googleでログイン'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-slate-600" />
          <span className="text-slate-500 text-sm">または</span>
          <div className="flex-1 h-px bg-slate-600" />
        </div>

        {/* Email Input */}
        <div className="mb-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-400 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Password Input */}
        <div className="mb-6">
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-400 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 mb-4"
        >
          {loading ? '処理中...' : isSignUp ? 'アカウント作成' : 'ログイン'}
        </button>

        {/* Toggle Login / Sign Up */}
        <div className="text-center">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            {isSignUp
              ? 'すでにアカウントをお持ちの方はこちら'
              : 'アカウントをお持ちでない方はこちら'}
          </button>
        </div>
      </div>
    </div>
  );
}
