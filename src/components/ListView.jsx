import { memo } from 'react';
import { genreColor } from '../lib/constants';

const ListView = memo(function ListView({ ideas, connections, genres, selectedId, setSelectedId }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-2">
        {ideas.length === 0 && <div className="text-center text-slate-500 text-sm mt-16">メモがありません</div>}
        {[...ideas].reverse().map(idea => {
          const conns = connections.filter(c => c.source === idea.id || c.target === idea.id);
          const genre = genres.find(g => g.id === idea.genre);
          return (
            <button key={idea.id} onClick={() => setSelectedId(idea.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedId === idea.id ? "bg-slate-700 border-indigo-500/50" : "bg-slate-800/50 border-slate-800 hover:border-slate-600"}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm text-slate-300 leading-relaxed">{idea.content.length > 120 ? idea.content.slice(0, 120) + "..." : idea.content}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {(idea.tags || []).map(t => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">#{t}</span>
                    ))}
                    {conns.length > 0 && <span className="text-xs text-slate-500">🔗{conns.length}</span>}
                  </div>
                </div>
                {genre && <span className="text-sm ml-2" title={genre.name}>{genre.emoji}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default ListView;
