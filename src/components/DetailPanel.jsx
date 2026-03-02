import { memo } from 'react';
import { genreColor } from '../lib/constants';

// R-08 fix: colored dot by layer, no text label
const layerDotColor = (bl) =>
  bl === 0 ? "bg-indigo-500" : bl === 1 ? "bg-blue-500" : bl === 2 ? "bg-pink-500" : "bg-amber-500";

const DetailPanel = memo(function DetailPanel({ selectedIdea, genres, connectedIdeas, tagIndex, tagInput, setTagInput, handleAddTag, handleRemoveTag, handleDelete, setSelectedId }) {
  if (!selectedIdea) return null;

  return (
    <div className="w-80 border-l border-slate-800 overflow-y-auto p-4 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{new Date(selectedIdea.createdAt).toLocaleDateString("ja-JP")}</span>
        <div className="flex gap-1">
          <button onClick={() => handleDelete(selectedIdea.id)} className="text-xs text-red-400/60 hover:text-red-400 px-1.5 py-0.5" title="削除">🗑</button>
          <button onClick={() => setSelectedId(null)} className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-0.5">✕</button>
        </div>
      </div>

      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap mb-3">{selectedIdea.content}</p>

      {selectedIdea.genre && (() => {
        const g = genres.find(g => g.id === selectedIdea.genre);
        return g ? (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: genreColor(genres, g.id) + "22", color: genreColor(genres, g.id), border: `1px solid ${genreColor(genres, g.id)}44` }}>
              {g.emoji} {g.name}
            </span>
          </div>
        ) : null;
      })()}

      {/* Tags - R-08 fix: no inline layer info text, only tooltip */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-1 mb-1.5">
          {(selectedIdea.tags || []).map(t => {
            const info = tagIndex[t];
            return (
              <span key={t} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400"
                title={info?.L1 ? `L1: ${info.L1}${info.L2 ? ` → L2: ${info.L2}` : ""}${info.L3 ? ` → L3: ${info.L3}` : ""}` : "未分類"}>
                #{t}
                <button onClick={() => handleRemoveTag(selectedIdea.id, t)}
                  className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors">×</button>
              </span>
            );
          })}
        </div>
        <div className="flex gap-1">
          <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleAddTag(selectedIdea.id, tagInput);
              if (e.key === "Escape") setTagInput("");
            }}
            placeholder="+ タグを追加"
            className="flex-1 text-xs px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
          {tagInput.trim() && (
            <button onClick={() => handleAddTag(selectedIdea.id, tagInput)}
              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors">追加</button>
          )}
        </div>
      </div>

      {/* Connected ideas - R-08 fix: colored dot only, no text strength label */}
      {connectedIdeas.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-2">リンク ({connectedIdeas.length})</div>
          <div className="space-y-1.5">
            {connectedIdeas.map(ci => (
              <button key={ci.id} onClick={() => setSelectedId(ci.id)}
                className="w-full text-left p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-colors">
                <div className="flex items-start gap-2">
                  {/* R-08 fix: small colored dot instead of text label */}
                  <span className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${layerDotColor(ci.bestLayer)}`}></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-300">{ci.summary || ci.content.slice(0, 40)}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(ci.matches || []).slice(0, 3).map((m, mi) => (
                        <span key={mi} className={`text-xs px-1 py-0 rounded ${
                          m.layer === 0 ? "bg-indigo-900/40 text-indigo-400/80" :
                          m.layer === 1 ? "bg-blue-900/40 text-blue-400/80" :
                          m.layer === 2 ? "bg-pink-900/40 text-pink-400/80" :
                          "bg-amber-900/40 text-amber-400/80"
                        }`}>
                          {m.layer === 0 ? `#${m.via}` : `${m.via}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {connectedIdeas.length === 0 && <div className="text-xs text-slate-600">リンクなし</div>}

      {/* R-04 fix: Serendipity section in detail panel */}
      {selectedIdea.serendipity?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400">✨</span>
            <span className="text-xs font-medium text-amber-400 tracking-wide">セレンディピティ</span>
          </div>
          <div className="space-y-2">
            {selectedIdea.serendipity.map((s, i) => (
              <div key={i} className="p-3 bg-amber-950/30 border border-amber-800/30 rounded-lg">
                <p className="text-xs text-amber-200/90 leading-relaxed">{s.insight}</p>
                {s.seed && <div className="mt-1.5 text-xs text-amber-400/70 flex items-start gap-1"><span>💡</span><span>{s.seed}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DetailPanel;
