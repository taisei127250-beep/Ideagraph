import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";

const STORAGE_KEY = "ideagraph-v4";
const GENRE_COLORS = ["#818cf8","#f472b6","#fbbf24","#34d399","#60a5fa","#a78bfa","#fb7185","#2dd4bf","#fb923c","#a3e635"];
const LAYER_COLORS = { 1: "#818cf8", 2: "#f472b6", 3: "#fbbf24" };
const LAYER_LABELS = { 1: "類義語", 2: "上位概念", 3: "最上位概念" };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function genreColor(genres, gid) {
  const i = genres.findIndex(g => g.id === gid);
  return i >= 0 ? GENRE_COLORS[i % GENRE_COLORS.length] : "#64748b";
}

// ─── Layered tag hierarchy: find shared ancestor layer ───
// Returns { layer, groupName } or null for each (tagA, tagB) pair
// Layer 0 = exact same tag (weight 4)
// Layer 1 = same synonym group (weight 3)
// Layer 2 = same upper concept (weight 2)
// Layer 3 = same top-level concept (weight 1)

function buildTagIndex(tagLayers) {
  // tag → { L1: groupName, L2: groupName, L3: groupName }
  const index = {};
  const l1Groups = (tagLayers.find(l => l.level === 1) || { groups: [] }).groups;
  const l2Groups = (tagLayers.find(l => l.level === 2) || { groups: [] }).groups;
  const l3Groups = (tagLayers.find(l => l.level === 3) || { groups: [] }).groups;

  // L1: tag → L1 group name
  for (const g of l1Groups) {
    for (const m of g.members || []) {
      if (!index[m]) index[m] = {};
      index[m].L1 = g.name;
    }
  }
  // L2: L1 group name → L2 group name (+ propagate to tags)
  const l1ToL2 = {};
  for (const g of l2Groups) {
    for (const child of g.children || []) {
      l1ToL2[child] = g.name;
    }
  }
  // L3: L2 group name → L3 group name
  const l2ToL3 = {};
  for (const g of l3Groups) {
    for (const child of g.children || []) {
      l2ToL3[child] = g.name;
    }
  }
  // Propagate L2/L3 to tag index
  for (const tag in index) {
    const l1Name = index[tag].L1;
    if (l1Name && l1ToL2[l1Name]) {
      index[tag].L2 = l1ToL2[l1Name];
      if (l2ToL3[l1ToL2[l1Name]]) {
        index[tag].L3 = l2ToL3[l1ToL2[l1Name]];
      }
    }
  }
  return index;
}

function getSharedLayer(tagA, tagB, tagIndex) {
  if (tagA === tagB) return { layer: 0, via: tagA };
  const a = tagIndex[tagA], b = tagIndex[tagB];
  if (!a || !b) return null;
  if (a.L1 && b.L1 && a.L1 === b.L1) return { layer: 1, via: a.L1 };
  if (a.L2 && b.L2 && a.L2 === b.L2) return { layer: 2, via: a.L2 };
  if (a.L3 && b.L3 && a.L3 === b.L3) return { layer: 3, via: a.L3 };
  return null;
}

const LAYER_WEIGHTS = { 0: 4, 1: 3, 2: 2, 3: 1 };

function computeConnections(ideas, tagLayers) {
  const tagIndex = buildTagIndex(tagLayers);
  const conns = [];
  for (let i = 0; i < ideas.length; i++) {
    const tagsA = ideas[i].tags || [];
    if (tagsA.length === 0) continue;
    for (let j = i + 1; j < ideas.length; j++) {
      const tagsB = ideas[j].tags || [];
      if (tagsB.length === 0) continue;

      let bestLayer = Infinity;
      const matches = []; // { tagA, tagB, layer, via }
      for (const tA of tagsA) {
        for (const tB of tagsB) {
          const shared = getSharedLayer(tA, tB, tagIndex);
          if (shared) {
            matches.push({ tagA: tA, tagB: tB, ...shared });
            if (shared.layer < bestLayer) bestLayer = shared.layer;
          }
        }
      }

      if (matches.length > 0) {
        // Weight = sum of individual match weights
        const weight = matches.reduce((sum, m) => sum + (LAYER_WEIGHTS[m.layer] || 0), 0);
        // Deduplicate "via" labels
        const viaSet = [...new Set(matches.map(m => `L${m.layer}:${m.via}`))];
        conns.push({
          source: ideas[i].id,
          target: ideas[j].id,
          weight,
          bestLayer,
          matches,
          viaLabels: viaSet,
        });
      }
    }
  }
  return conns;
}

async function load() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function save(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.error(e); }
}

async function claude(prompt) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    const t = (j.content || []).map(c => c.text || "").join("");
    return JSON.parse(t.replace(/```json\n?|```\n?/g, "").trim());
  } catch (e) { console.error("API error:", e); return null; }
}

// ─── Prompts ───

function buildAnalysisPrompt(content, ideas, genres, existingTags, tagLayers) {
  const tagList = existingTags.length > 0 ? existingTags.join(", ") : "（まだなし）";
  const l1 = (tagLayers.find(l => l.level === 1) || { groups: [] }).groups;
  const layerInfo = l1.length > 0
    ? l1.map(g => `「${g.name}」= [${(g.members||[]).join(", ")}]`).join("\n")
    : "（まだなし）";

  const genreList = genres.length > 0
    ? genres.map(g => `${g.emoji} ${g.name} (${g.idea_ids.length}件)`).join(", ")
    : "まだなし";

  const serendipitySection = genres.length >= 2
    ? `4. 新しいメモが属するジャンル"以外"から、意外で創造的な接続を1〜2個見つけて。該当がなければ空配列。`
    : `4. serendipityは空配列[]にして。`;

  const existingList = ideas.length > 0
    ? ideas.map(i => `- [${i.id}] ${i.summary || i.content.slice(0, 60)}`).join("\n")
    : "";

  return `あなたはアイデア分析エンジンです。新しいメモにタグとジャンルを付与。JSONのみで応答。

【新しいメモ】
${content}

【既存タグ一覧】
${tagList}

【タグの類義語グループ（Layer 1）】
${layerInfo}

【現在のジャンル分類】
${genreList}

${existingList ? `【既存メモ一覧】(セレンディピティ判定用)\n${existingList}\n` : ""}
【タスク】
1. タグ2〜5個。既存タグ・グループの正規名を優先使用。新規は既存にない概念のみ。具体的かつ再利用可能な粒度で。
2. 15文字以内の要約
3. ジャンル割り当て（既存or新規提案）
${serendipitySection}

JSON形式のみ:
{"tags":["タグ1","タグ2"],"summary":"要約","genre":{"id":"string","name":"名前","emoji":"絵文字"},"serendipity":[{"idea_id":"既存メモID","insight":"説明","seed":"アイデアの種"}]}`;
}

function buildL1Prompt(allTags, existingL1Groups) {
  const existing = existingL1Groups.length > 0
    ? existingL1Groups.map(g => `「${g.name}」= [${(g.members||[]).join(", ")}]`).join("\n")
    : "（初回）";

  const allGroupedTags = new Set(existingL1Groups.flatMap(g => g.members || []));
  const unassigned = allTags.filter(t => !allGroupedTags.has(t));

  return `以下のタグを類義語グループに分類してください。JSONのみで応答。

【ルール】
- 同じ概念、類義語、非常に近い関連語をグループにまとめる
- 既存グループは変更・削除しない。新タグを既存グループに追加するか、新グループを作る
- 各グループに最も代表的な名前をつける
- 日本語と英語が混在する場合、同じ意味なら同じグループに
- 1タグのみのグループもOK

【既存グループ（変更不可）】
${existing}

【未分類タグ】
${unassigned.length > 0 ? unassigned.join(", ") : "なし"}

【全タグ一覧】（参考）
${allTags.join(", ")}

JSON形式のみ:
{"groups":[{"name":"グループ名","members":["タグ1","タグ2"]}]}`;
}

function buildL2Prompt(l1Groups, existingL2Groups) {
  const l1List = l1Groups.map(g => `「${g.name}」(${(g.members||[]).length}タグ)`).join(", ");
  const existing = existingL2Groups.length > 0
    ? existingL2Groups.map(g => `「${g.name}」= [${(g.children||[]).join(", ")}]`).join("\n")
    : "（初回）";

  const allAssigned = new Set(existingL2Groups.flatMap(g => g.children || []));
  const unassigned = l1Groups.filter(g => !allAssigned.has(g.name)).map(g => g.name);

  return `以下のLayer1グループを上位概念でまとめてください。JSONのみで応答。

【ルール】
- 関連するLayer1グループを上位概念でまとめる
- 既存の上位概念グループは変更・削除しない。新しいL1グループを追加するか、新しい上位概念を作る
- 各上位概念に代表的な名前をつける

【既存の上位概念グループ（変更不可）】
${existing}

【未分類のLayer1グループ】
${unassigned.length > 0 ? unassigned.join(", ") : "なし"}

【全Layer1グループ一覧】
${l1List}

JSON形式のみ:
{"groups":[{"name":"上位概念名","children":["L1グループ名1","L1グループ名2"]}]}`;
}

function buildL3Prompt(l2Groups, existingL3Groups) {
  const l2List = l2Groups.map(g => `「${g.name}」(子: ${(g.children||[]).join(", ")})`).join(", ");
  const existing = existingL3Groups.length > 0
    ? existingL3Groups.map(g => `「${g.name}」= [${(g.children||[]).join(", ")}]`).join("\n")
    : "（初回）";

  return `以下のLayer2グループを最上位概念でまとめてください。JSONのみで応答。

【ルール】
- 既存グループは変更・削除しない
- 各最上位概念に代表的な名前をつける

【既存の最上位概念グループ】
${existing}

【全Layer2グループ一覧】
${l2List}

JSON形式のみ:
{"groups":[{"name":"最上位概念名","children":["L2グループ名1","L2グループ名2"]}]}`;
}

function buildReclassifyPrompt(ideas, prevGenres) {
  const list = ideas.map(i => `- [${i.id}] ${i.summary || i.content.slice(0, 60)} (tags: ${(i.tags||[]).join(", ")})`).join("\n");
  const prev = prevGenres.length > 0
    ? prevGenres.map(g => `${g.emoji} ${g.name}: ${g.idea_ids.join(", ")}`).join("\n")
    : "初回分類";

  return `以下の${ideas.length}件のメモを自然なグループに分類。JSON以外含めないで。

【ルール】
- グループ数: 10件以下→2-3群, 30件→5-7群, 50件以上→8-12群
- 前回ベースで最小限の変更
- ジャンルIDは英数字スネークケース

【前回の分類】
${prev}

【メモ一覧】
${list}

JSON形式のみ:
{"genres":[{"id":"string","name":"名前","emoji":"絵文字","idea_ids":["id1","id2"]}]}`;
}

// ─── Graph Component ───
function GraphView({ ideas, connections, genres, onSelect, selectedId }) {
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

    const nodes = ideas.map(i => ({ id: i.id, label: i.summary || i.content.slice(0, 20), genre: i.genre, lc: linkCounts[i.id] || 0 }));
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
      .attr("fill", d => genreColor(genres, d.genre))
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
  }, [ideas, connections, genres, selectedId]);

  if (ideas.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-500">メモを追加するとグラフが表示されます</div>;
  }

  return (
    <div className="flex-1 relative">
      <svg ref={svgRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 p-2 rounded-lg border border-slate-700/50 text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-indigo-400 block"></span><span className="text-slate-400">完全一致</span></div>
        <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-blue-400 block"></span><span className="text-slate-400">類義語 (L1)</span></div>
        <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-pink-400 block"></span><span className="text-slate-400">上位概念 (L2)</span></div>
        <div className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-amber-400 block"></span><span className="text-slate-400">最上位 (L3)</span></div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function IdeaGraph() {
  const [data, setData] = useState({ ideas: [], genres: [], tagLayers: [] });
  const [input, setInput] = useState("");
  const [view, setView] = useState("input");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [serendipity, setSerendipity] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [initLoading, setInitLoading] = useState(true);
  const [tagInput, setTagInput] = useState("");

  const allTags = useMemo(() => [...new Set(data.ideas.flatMap(i => i.tags || []))], [data.ideas]);
  const connections = useMemo(() => computeConnections(data.ideas, data.tagLayers), [data.ideas, data.tagLayers]);

  const getL = (level) => (data.tagLayers.find(l => l.level === level) || { groups: [] }).groups;

  useEffect(() => {
    load().then(d => {
      if (d) {
        const { connections: _, tagGroups, ...rest } = d;
        setData({
          ideas: rest.ideas || [],
          genres: rest.genres || [],
          tagLayers: rest.tagLayers || [],
        });
      }
      setInitLoading(false);
    });
  }, []);

  const selectedIdea = data.ideas.find(i => i.id === selectedId);
  useEffect(() => { setTagInput(""); }, [selectedId]);

  // ─── Layer management: additive only ───
  const updateLayers = useCallback(async (finalData) => {
    const tags = [...new Set(finalData.ideas.flatMap(i => i.tags || []))];
    let layers = [...(finalData.tagLayers || [])];

    const getLayer = (level) => layers.find(l => l.level === level);
    const setLayer = (level, groups) => {
      const existing = layers.findIndex(l => l.level === level);
      if (existing >= 0) layers[existing] = { level, groups };
      else layers.push({ level, groups });
    };

    const l1 = getLayer(1);
    const l1Groups = l1 ? l1.groups : [];
    const l1Tagged = new Set(l1Groups.flatMap(g => g.members || []));
    const unassignedTags = tags.filter(t => !l1Tagged.has(t));

    // L1: generate/update when 8+ tags AND there are unassigned tags
    if (tags.length >= 8 && unassignedTags.length > 0) {
      setLoadingMsg("L1: 類義語グループ更新中...");
      const result = await claude(buildL1Prompt(tags, l1Groups));
      if (result?.groups) {
        setLayer(1, result.groups);
      }
    }

    // L2: generate/update when 5+ L1 groups
    const currentL1 = (getLayer(1) || { groups: [] }).groups;
    const l2 = getLayer(2);
    const l2Groups = l2 ? l2.groups : [];
    const l2Children = new Set(l2Groups.flatMap(g => g.children || []));
    const unassignedL1 = currentL1.filter(g => !l2Children.has(g.name));

    if (currentL1.length >= 5 && unassignedL1.length > 0) {
      setLoadingMsg("L2: 上位概念グループ更新中...");
      const result = await claude(buildL2Prompt(currentL1, l2Groups));
      if (result?.groups) {
        setLayer(2, result.groups);
      }
    }

    // L3: generate/update when 5+ L2 groups
    const currentL2 = (getLayer(2) || { groups: [] }).groups;
    const l3 = getLayer(3);
    const l3Groups = l3 ? l3.groups : [];
    const l3Children = new Set(l3Groups.flatMap(g => g.children || []));
    const unassignedL2 = currentL2.filter(g => !l3Children.has(g.name));

    if (currentL2.length >= 5 && unassignedL2.length > 0) {
      setLoadingMsg("L3: 最上位概念グループ更新中...");
      const result = await claude(buildL3Prompt(currentL2, l3Groups));
      if (result?.groups) {
        setLayer(3, result.groups);
      }
    }

    return { ...finalData, tagLayers: layers };
  }, []);

  const handleSave = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newIdea = { id: uid(), content: text, tags: [], summary: "", genre: null, createdAt: new Date().toISOString() };
    const updated = { ...data, ideas: [...data.ideas, newIdea] };
    setData(updated);
    setInput("");
    setSerendipity(null);
    setLoading(true);
    setLoadingMsg("分析中...");
    await save(updated);

    const existingTags = [...new Set(data.ideas.flatMap(i => i.tags || []))];
    const prompt = buildAnalysisPrompt(text, data.ideas, data.genres, existingTags, data.tagLayers);
    const result = await claude(prompt);

    let final = { ...updated };
    if (result) {
      final.ideas = [...data.ideas, {
        ...newIdea,
        tags: result.tags || [],
        summary: result.summary || text.slice(0, 20),
        genre: result.genre?.id || null,
      }];

      if (result.genre && !final.genres.some(g => g.id === result.genre.id)) {
        final.genres = [...final.genres, { ...result.genre, idea_ids: [newIdea.id] }];
      } else if (result.genre) {
        final.genres = final.genres.map(g =>
          g.id === result.genre.id ? { ...g, idea_ids: [...new Set([...g.idea_ids, newIdea.id])] } : g
        );
      }

      if (result.serendipity?.length > 0) setSerendipity(result.serendipity);
    }

    // Genre reclassification every 5 ideas
    if (final.ideas.length >= 5 && final.ideas.length % 5 === 0) {
      setLoadingMsg("ジャンル再分類中...");
      const reclass = await claude(buildReclassifyPrompt(final.ideas, final.genres));
      if (reclass?.genres) {
        final.genres = reclass.genres;
        final.ideas = final.ideas.map(idea => {
          const g = reclass.genres.find(g => g.idea_ids.includes(idea.id));
          return g ? { ...idea, genre: g.id } : idea;
        });
      }
    }

    // Layer updates (additive)
    final = await updateLayers(final);

    setData(final);
    await save(final);
    setLoading(false);
    setLoadingMsg("");
  }, [input, data, loading, updateLayers]);

  const handleDelete = useCallback(async (id) => {
    const updated = {
      ...data,
      ideas: data.ideas.filter(i => i.id !== id),
      genres: data.genres.map(g => ({ ...g, idea_ids: g.idea_ids.filter(i => i !== id) })),
    };
    setData(updated);
    setSelectedId(null);
    await save(updated);
  }, [data]);

  const handleReset = useCallback(async () => {
    if (!confirm("全データを削除しますか？")) return;
    const empty = { ideas: [], genres: [], tagLayers: [] };
    setData(empty);
    setSerendipity(null);
    setSelectedId(null);
    await save(empty);
  }, []);

  const handleAddTag = useCallback(async (ideaId, tag) => {
    const clean = tag.trim().replace(/^#/, "");
    if (!clean) return;
    const updated = {
      ...data,
      ideas: data.ideas.map(i =>
        i.id === ideaId && !(i.tags || []).includes(clean)
          ? { ...i, tags: [...(i.tags || []), clean] }
          : i
      ),
    };
    setData(updated);
    setTagInput("");
    await save(updated);
  }, [data]);

  const handleRemoveTag = useCallback(async (ideaId, tag) => {
    const updated = {
      ...data,
      ideas: data.ideas.map(i =>
        i.id === ideaId ? { ...i, tags: (i.tags || []).filter(t => t !== tag) } : i
      ),
    };
    setData(updated);
    await save(updated);
  }, [data]);

  // Force layer rebuild
  const handleForceLayerUpdate = useCallback(async () => {
    if (allTags.length < 4) return;
    setLoading(true);
    setLoadingMsg("レイヤー再構築中...");
    // Reset layers and rebuild from scratch
    const resetData = { ...data, tagLayers: [] };
    const updated = await updateLayers(resetData);
    setData(updated);
    await save(updated);
    setLoading(false);
    setLoadingMsg("");
  }, [data, allTags, updateLayers]);

  const connectedIdeas = useMemo(() => {
    if (!selectedIdea) return [];
    return connections
      .filter(c => c.source === selectedId || c.target === selectedId)
      .map(c => {
        const otherId = c.source === selectedId ? c.target : c.source;
        const other = data.ideas.find(i => i.id === otherId);
        return other ? { ...other, weight: c.weight, bestLayer: c.bestLayer, matches: c.matches } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight);
  }, [connections, selectedId, selectedIdea, data.ideas]);

  const tagIndex = useMemo(() => buildTagIndex(data.tagLayers), [data.tagLayers]);

  if (initLoading) {
    return <div className="flex items-center justify-center h-screen bg-slate-900 text-slate-400">読み込み中...</div>;
  }

  const layerStrengthLabel = (bl) => bl === 0 ? "完全一致" : bl === 1 ? "類義語" : bl === 2 ? "上位概念" : "最上位";
  const layerStrengthColor = (bl) => bl === 0 ? "text-indigo-400" : bl === 1 ? "text-blue-400" : bl === 2 ? "text-pink-400" : "text-amber-400";

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-bold text-sm tracking-wide">IdeaGraph</span>
          <span className="text-xs text-slate-500 ml-1">{data.ideas.length}件</span>
        </div>
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
      </div>

      {/* Genre chips */}
      {data.genres.length > 0 && (
        <div className="flex gap-1.5 px-4 py-1.5 overflow-x-auto border-b border-slate-800/50">
          {data.genres.map(g => (
            <span key={g.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap"
              style={{ backgroundColor: genreColor(data.genres, g.id) + "22", color: genreColor(data.genres, g.id), border: `1px solid ${genreColor(data.genres, g.id)}44` }}>
              {g.emoji} {g.name}
              <span className="opacity-60">{g.idea_ids.length}</span>
            </span>
          ))}
        </div>
      )}

      {/* Main */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* ── Input View ── */}
          {view === "input" && (
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

                {serendipity?.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-400">✨</span>
                      <span className="text-xs font-medium text-amber-400 tracking-wide">セレンディピティ</span>
                    </div>
                    <div className="space-y-2">
                      {serendipity.map((s, i) => {
                        const linked = data.ideas.find(idea => idea.id === s.idea_id);
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

                {data.ideas.length > 0 && (
                  <div className="mt-6">
                    <div className="text-xs text-slate-500 mb-2">最近のメモ</div>
                    <div className="space-y-1.5">
                      {data.ideas.slice(-8).reverse().map(idea => (
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
                              <span className="text-xs mt-0.5" style={{ color: genreColor(data.genres, idea.genre) }}>
                                {data.genres.find(g => g.id === idea.genre)?.emoji || ""}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {data.ideas.length === 0 && !loading && (
                  <div className="mt-16 text-center">
                    <div className="text-4xl mb-4">🌱</div>
                    <p className="text-slate-500 text-sm">最初のアイデアを書いてみましょう</p>
                    <p className="text-slate-600 text-xs mt-1">メモが増えるとつながりが自動で見えてきます</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Graph View ── */}
          {view === "graph" && (
            <div className="flex-1 overflow-hidden">
              <GraphView ideas={data.ideas} connections={connections} genres={data.genres} onSelect={setSelectedId} selectedId={selectedId} />
            </div>
          )}

          {/* ── List View ── */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-2xl mx-auto space-y-2">
                {data.ideas.length === 0 && <div className="text-center text-slate-500 text-sm mt-16">メモがありません</div>}
                {[...data.ideas].reverse().map(idea => {
                  const conns = connections.filter(c => c.source === idea.id || c.target === idea.id);
                  const genre = data.genres.find(g => g.id === idea.genre);
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
          )}

          {/* ── Layer View ── */}
          {view === "layers" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-medium text-slate-300">タグレイヤー階層</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {allTags.length}タグ · レイヤーが深いほど広い概念でリンクされます
                    </p>
                  </div>
                  <button onClick={handleForceLayerUpdate} disabled={loading || allTags.length < 4}
                    className="px-3 py-1.5 bg-slate-800 text-slate-400 text-xs rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700">
                    {loading ? loadingMsg : "🔄 再構築"}
                  </button>
                </div>

                {data.tagLayers.length === 0 ? (
                  <div className="text-center mt-12">
                    <div className="text-3xl mb-3">🏷️</div>
                    <p className="text-sm text-slate-500">タグが8つ以上になるとレイヤーが自動生成されます</p>
                    <p className="text-xs text-slate-600 mt-1">現在 {allTags.length} タグ</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {[3, 2, 1].map(level => {
                      const layer = data.tagLayers.find(l => l.level === level);
                      if (!layer || layer.groups.length === 0) return null;
                      const color = LAYER_COLORS[level];
                      return (
                        <div key={level}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color + "22", color, border: `1px solid ${color}44` }}>
                              L{level}
                            </span>
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
                      const l1 = (data.tagLayers.find(l => l.level === 1) || { groups: [] }).groups;
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
          )}
        </div>

        {/* ── Detail Panel ── */}
        {selectedIdea && (
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
              const g = data.genres.find(g => g.id === selectedIdea.genre);
              return g ? (
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: genreColor(data.genres, g.id) + "22", color: genreColor(data.genres, g.id), border: `1px solid ${genreColor(data.genres, g.id)}44` }}>
                    {g.emoji} {g.name}
                  </span>
                </div>
              ) : null;
            })()}

            {/* Tags with layer info */}
            <div className="mb-4">
              <div className="flex flex-wrap gap-1 mb-1.5">
                {(selectedIdea.tags || []).map(t => {
                  const info = tagIndex[t];
                  return (
                    <span key={t} className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400"
                      title={info?.L1 ? `L1: ${info.L1}${info.L2 ? ` → L2: ${info.L2}` : ""}${info.L3 ? ` → L3: ${info.L3}` : ""}` : "未分類"}>
                      #{t}
                      {info?.L1 && <span className="text-blue-400/40 ml-0.5 text-xs">·{info.L1}</span>}
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

            {/* Connections with layer info */}
            {connectedIdeas.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">リンク ({connectedIdeas.length})</div>
                <div className="space-y-1.5">
                  {connectedIdeas.map(ci => (
                    <button key={ci.id} onClick={() => setSelectedId(ci.id)}
                      className="w-full text-left p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="text-xs text-slate-300 flex-1">{ci.summary || ci.content.slice(0, 40)}</div>
                        <span className={`text-xs ml-1 ${layerStrengthColor(ci.bestLayer)}`}>{layerStrengthLabel(ci.bestLayer)}</span>
                      </div>
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
                    </button>
                  ))}
                </div>
              </div>
            )}
            {connectedIdeas.length === 0 && <div className="text-xs text-slate-600">リンクなし</div>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-800 text-xs text-slate-600">
        <span>
          {data.genres.length}ジャンル · {connections.length}リンク · {allTags.length}タグ
          {getL(1).length > 0 && ` · L1:${getL(1).length}`}
          {getL(2).length > 0 && ` · L2:${getL(2).length}`}
          {getL(3).length > 0 && ` · L3:${getL(3).length}`}
        </span>
        <button onClick={handleReset} className="hover:text-red-400 transition-colors">リセット</button>
      </div>
    </div>
  );
}
