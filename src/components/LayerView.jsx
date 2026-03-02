import { memo } from 'react';
import { LAYER_COLORS, LAYER_LABELS } from '../lib/constants';

const LayerView = memo(function LayerView({ tagLayers, allTags, loading, loadingMsg, handleForceLayerUpdate }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-slate-300">タグレイヤー階層</h2>
            {/* R-07 fix: user-friendly description */}
            <p className="text-xs text-slate-500 mt-0.5">
              {allTags.length}タグ · レイヤーが深いほど広い概念でリンクされます
            </p>
          </div>
          <button onClick={handleForceLayerUpdate} disabled={loading || allTags.length < 4}
            className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700">
            {loading ? loadingMsg : "🔄 再構築"}
          </button>
        </div>

        {tagLayers.length === 0 ? (
          <div className="text-center mt-12">
            <div className="text-3xl mb-3">🏷️</div>
            <p className="text-sm text-slate-500">タグが8つ以上になるとレイヤーが自動生成されます</p>
            <p className="text-xs text-slate-600 mt-1">現在 {allTags.length} タグ</p>
          </div>
        ) : (
          <div className="space-y-6">
            {[3, 2, 1].map(level => {
              const layer = tagLayers.find(l => l.level === level);
              if (!layer || layer.groups.length === 0) return null;
              const color = LAYER_COLORS[level];
              return (
                <div key={level}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color + "22", color, border: `1px solid ${color}44` }}>
                      L{level}
                    </span>
                    {/* R-07 fix: use LAYER_LABELS from constants */}
                    <span className="text-xs text-slate-400">{LAYER_LABELS[level]} ({layer.groups.length}グループ)</span>
                  </div>
                  <div className="space-y-2 ml-2">
                    {layer.groups.map((g, gi) => (
                      <div key={gi} className="p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                        <div className="text-sm font-medium mb-1.5" style={{ color }}>{g.name}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(level === 1 ? (g.members || []) : (g.children || [])).map(m => (
                            <span key={m} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                              {level === 1 ? `#${m}` : m}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Unassigned tags */}
            {(() => {
              const l1 = (tagLayers.find(l => l.level === 1) || { groups: [] }).groups;
              const assigned = new Set(l1.flatMap(g => g.members || []));
              const unassigned = allTags.filter(t => !assigned.has(t));
              if (unassigned.length === 0) return null;
              return (
                <div>
                  <div className="text-xs text-slate-500 mb-2">未分類タグ ({unassigned.length})</div>
                  <div className="flex flex-wrap gap-1.5 ml-2">
                    {unassigned.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-500">#{t}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
});

export default LayerView;
