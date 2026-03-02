import { useEffect, useRef, memo } from "react";
import * as d3 from "d3";
import { genreColor } from '../lib/constants';

const GraphView = memo(function GraphView({ ideas, connections, genres, onSelect, selectedId, userColorMap, profiles }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || ideas.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const rect = svgRef.current.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    const container = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.15, 5]).on("zoom", e => container.attr("transform", e.transform)));

    const linkCounts = {};
    connections.forEach(c => {
      linkCounts[c.source] = (linkCounts[c.source] || 0) + 1;
      linkCounts[c.target] = (linkCounts[c.target] || 0) + 1;
    });

    const nodes = ideas.map(i => ({ id: i.id, label: i.summary || i.content.slice(0, 20), genre: i.genre, userId: i.user_id, lc: linkCounts[i.id] || 0 }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = connections.filter(c => nodeIds.has(c.source) && nodeIds.has(c.target)).map(c => ({ ...c }));

    const maxWeight = Math.max(1, ...links.map(l => l.weight));

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => 180 - (d.weight / maxWeight) * 100))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(35));

    // Edge color by best layer
    const layerStroke = (bl) => bl === 0 ? "#818cf8" : bl === 1 ? "#60a5fa" : bl === 2 ? "#f472b6" : "#fbbf24";

    const linkEl = container.selectAll("line").data(links).join("line")
      .attr("stroke", d => layerStroke(d.bestLayer))
      .attr("stroke-width", d => 0.5 + (d.weight / maxWeight) * 3)
      .attr("stroke-opacity", d => 0.25 + (d.weight / maxWeight) * 0.5)
      .attr("stroke-dasharray", d => d.bestLayer >= 2 ? "4,3" : "none");

    const nodeG = container.selectAll("g.node").data(nodes).join("g").attr("class", "node")
      .style("cursor", "pointer")
      .on("click", (_, d) => onSelect(d.id))
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeG.append("circle")
      .attr("r", d => 7 + d.lc * 1.5)
      .attr("fill", d => userColorMap && d.userId ? (userColorMap[d.userId] || "#64748b") : genreColor(genres, d.genre))
      .attr("stroke", d => d.id === selectedId ? "#fff" : "#0f172a")
      .attr("stroke-width", d => d.id === selectedId ? 3 : 2);

    nodeG.append("text").text(d => d.label)
      .attr("dx", d => 10 + d.lc * 1.5).attr("dy", 4)
      .attr("fill", "#94a3b8").attr("font-size", "11px").attr("pointer-events", "none");

    sim.on("tick", () => {
      linkEl.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    return () => sim.stop();
  }, [ideas, connections, genres, selectedId, userColorMap, profiles]);

  if (ideas.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-500">メモを追加するとグラフが表示されます</div>;
  }

  return (
    <div className="flex-1 relative">
      {/* R-12 fix: explicit width/height style on SVG */}
      <svg ref={svgRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      {/* Legend - R-07 fix: human-readable labels */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 p-2 rounded-lg border border-slate-700/50 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-indigo-400 block"></span><span className="text-slate-400">完全一致</span></div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-blue-400 block"></span><span className="text-slate-400">似たタグ</span></div>
        <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-pink-400 block"></span><span className="text-slate-400">大きなまとまり</span></div>
        <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-amber-400 block"></span><span className="text-slate-400">テーマ</span></div>
      </div>
      {profiles?.length > 0 && (
        <div className="absolute top-3 right-3 bg-slate-900/90 p-2 rounded-lg border border-slate-700/50 text-xs space-y-1">
          <div className="text-slate-500 mb-1">ユーザー</div>
          {profiles.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full block" style={{ backgroundColor: userColorMap?.[p.id] || '#64748b' }}></span>
              <span className="text-slate-400">{p.display_name || 'Unknown'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default GraphView;
