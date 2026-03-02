export default function Header({ ideaCount, view, setView, user, onSignOut, viewMode, setViewMode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧠</span>
        <span className="font-bold text-sm tracking-wide">IdeaGraph</span>
        <span className="text-xs text-slate-500 ml-1">{ideaCount}件</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {[
            ["input", "✏️ メモ"],
            ["graph", "🕸️ グラフ"],
            ["list", "📋 一覧"],
            ["layers", "🏷️ レイヤー"],
          ].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${view === v ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
              {label}
            </button>
          ))}
        </div>
        {user && (
          <div className="flex bg-slate-800 rounded-lg p-0.5 ml-2">
            <button onClick={() => setViewMode("personal")}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${viewMode === "personal" ? "bg-slate-600 text-slate-200" : "text-slate-500 hover:text-slate-400"}`}>
              マイメモ
            </button>
            <button onClick={() => setViewMode("integrated")}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${viewMode === "integrated" ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-400"}`}>
              みんなのマップ
            </button>
          </div>
        )}
        {user && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-700">
            <span className="text-xs text-slate-400 truncate max-w-[120px]">
              {user.user_metadata?.full_name || user.email}
            </span>
            <button onClick={onSignOut}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
