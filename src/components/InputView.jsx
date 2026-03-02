import { genreColor } from '../lib/constants';

export default function InputView({ input, setInput, loading, loadingMsg, handleSave, ideas, genres, selectedId, setSelectedId, latestSerendipity }) {
  const remainingForLayer = Math.max(0, 8 - ideas.length);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave(); }}
            placeholder="気づき・アイデア・インプットを書く..."
            className="w-full h-32 p-4 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm leading-relaxed"
            disabled={loading} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-600">⌘+Enter で保存</span>
            <button onClick={handleSave} disabled={!input.trim() || loading}
              className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {loading ? loadingMsg : "保存"}
            </button>
          </div>
        </div>

        {/* R-04 fix: Show serendipity from latestSerendipity prop */}
        {latestSerendipity?.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-400">✨</span>
              <span className="text-xs font-medium text-amber-400 tracking-wide">セレンディピティ</span>
            </div>
            <div className="space-y-2">
              {latestSerendipity.map((s, i) => {
                const linked = ideas.find(idea => idea.id === s.idea_id);
                return (
                  <div key={i} className="p-3 bg-amber-950/30 border border-amber-800/30 rounded-lg">
                    {linked && <div className="text-xs text-amber-500/80 mb-1">🔗 {linked.summary || linked.content.slice(0, 40)}</div>}
                    <p className="text-sm text-amber-200/90 leading-relaxed">{s.insight}</p>
                    {s.seed && <div className="mt-2 text-xs text-amber-400/70 flex items-start gap-1"><span>💡</span><span>{s.seed}</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* R-11 fix: Enhanced onboarding */}
        {ideas.length === 0 && !loading && (
          <div className="mt-16 text-center">
            <div className="text-4xl mb-4">🌱</div>
            <p className="text-slate-400 text-sm font-medium mb-2">最初のアイデアを書いてみましょう</p>
            <p className="text-slate-500 text-xs leading-relaxed max-w-xs mx-auto">
              日々の気づき、読書メモ、アイデアなど、なんでも書いてみましょう。<br />
              メモが増えると、つながりが自動で見えてきます。
            </p>
          </div>
        )}

        {/* R-11 fix: Progress hint toward layer generation */}
        {ideas.length > 0 && ideas.length < 8 && (
          <div className="mt-4 px-3 py-2 bg-indigo-950/30 border border-indigo-800/30 rounded-lg text-xs text-indigo-400/80 text-center">
            あと {remainingForLayer} 個のメモでタグのつながりが生成されます
          </div>
        )}

        {ideas.length > 0 && (
          <div className="mt-6">
            <div className="text-xs text-slate-500 mb-2">最近のメモ</div>
            <div className="space-y-1.5">
              {ideas.slice(-8).reverse().map(idea => (
                <button key={idea.id} onClick={() => setSelectedId(idea.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${selectedId === idea.id ? "bg-slate-700 border-indigo-500/50" : "bg-slate-800/50 border-slate-800 hover:border-slate-600"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-300 truncate">{idea.summary || idea.content.slice(0, 50)}</div>
                      {idea.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {idea.tags.map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {idea.genre && (
                      <span className="text-xs mt-0.5" style={{ color: genreColor(genres, idea.genre) }}>
                        {genres.find(g => g.id === idea.genre)?.emoji || ""}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
