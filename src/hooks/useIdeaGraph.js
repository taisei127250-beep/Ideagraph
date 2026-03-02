import { useState, useEffect, useCallback, useMemo } from "react";
import { uid } from '../lib/constants';
import { computeConnections, buildTagIndex } from '../lib/connections';
import { buildAnalysisPrompt, buildL1Prompt, buildL2Prompt, buildL3Prompt, buildReclassifyPrompt } from '../lib/prompts';
import { loadLocal, saveLocal, callClaude, exportDataAsJSON, loadUserData, saveIdea, deleteIdea, saveGenres, saveTagLayers, callClaudeViaProxy } from '../lib/api';
import { mergeL1Groups, mergeLayerGroups, validateGenreAssignment } from '../lib/mergeLogic';
import { supabase } from '../lib/supabase';
import { migrateLocalToSupabase } from '../lib/dataMigration';

export default function useIdeaGraph(userId = null) {
  const [data, setData] = useState({ ideas: [], genres: [], tagLayers: [] });
  const [input, setInput] = useState("");
  const [view, setView] = useState("input");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [initLoading, setInitLoading] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState(null);

  const allTags = useMemo(() => [...new Set(data.ideas.flatMap(i => i.tags || []))], [data.ideas]);
  const connections = useMemo(() => computeConnections(data.ideas, data.tagLayers), [data.ideas, data.tagLayers]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (userId) {
        try {
          // Attempt migration on first login (no-op if already migrated)
          await migrateLocalToSupabase(supabase, userId);
          const loaded = await loadUserData(supabase, userId);
          if (!cancelled) {
            setData({
              ideas: loaded.ideas || [],
              genres: loaded.genres || [],
              tagLayers: loaded.tagLayers || [],
            });
          }
        } catch (e) {
          if (!cancelled) setError("データの読み込みに失敗しました: " + e.message);
        }
      } else {
        const loaded = loadLocal();
        if (loaded && !cancelled) {
          const { connections: _, tagGroups, ...rest } = loaded;
          setData({
            ideas: rest.ideas || [],
            genres: rest.genres || [],
            tagLayers: rest.tagLayers || [],
          });
        }
      }
      if (!cancelled) setInitLoading(false);
    }
    setInitLoading(true);
    init();
    return () => { cancelled = true; };
  }, [userId]);

  const selectedIdea = data.ideas.find(i => i.id === selectedId);
  useEffect(() => { setTagInput(""); }, [selectedId]);

  const tagIndex = useMemo(() => buildTagIndex(data.tagLayers), [data.tagLayers]);

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

  const invokeClaudeApi = useCallback(async (prompt) => {
    if (userId) {
      return callClaudeViaProxy(supabase, prompt);
    }
    return callClaude(prompt);
  }, [userId]);

  // R-09: Safe save wrapper — branches on userId
  const safeSave = useCallback(async (d) => {
    try {
      if (userId) {
        await Promise.all([
          saveGenres(supabase, userId, d.genres),
          saveTagLayers(supabase, userId, d.tagLayers),
        ]);
      } else {
        saveLocal(d);
      }
    } catch (e) {
      setError("データの保存に失敗しました: " + e.message);
    }
  }, [userId]);

  // Layer management: additive only, with R-02 merge logic
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
      setLoadingMsg("L1: 似たタグのグループ更新中...");
      try {
        const result = await invokeClaudeApi(buildL1Prompt(tags, l1Groups));
        if (result) {
          const merged = mergeL1Groups(l1Groups, result);
          setLayer(1, merged);
        }
      } catch (e) {
        console.error("L1 update failed:", e);
      }
    }

    // L2: generate/update when 5+ L1 groups
    const currentL1 = (getLayer(1) || { groups: [] }).groups;
    const l2 = getLayer(2);
    const l2Groups = l2 ? l2.groups : [];
    const l2Children = new Set(l2Groups.flatMap(g => g.children || []));
    const unassignedL1 = currentL1.filter(g => !l2Children.has(g.name));

    if (currentL1.length >= 5 && unassignedL1.length > 0) {
      setLoadingMsg("L2: 大きなまとまりの更新中...");
      try {
        const result = await invokeClaudeApi(buildL2Prompt(currentL1, l2Groups));
        if (result?.groups) {
          const merged = mergeLayerGroups(l2Groups, result.groups);
          setLayer(2, merged);
        }
      } catch (e) {
        console.error("L2 update failed:", e);
      }
    }

    // L3: generate/update when 5+ L2 groups
    const currentL2 = (getLayer(2) || { groups: [] }).groups;
    const l3 = getLayer(3);
    const l3Groups = l3 ? l3.groups : [];
    const l3Children = new Set(l3Groups.flatMap(g => g.children || []));
    const unassignedL2 = currentL2.filter(g => !l3Children.has(g.name));

    if (currentL2.length >= 5 && unassignedL2.length > 0) {
      setLoadingMsg("L3: テーマの更新中...");
      try {
        const result = await invokeClaudeApi(buildL3Prompt(currentL2, l3Groups));
        if (result?.groups) {
          const merged = mergeLayerGroups(l3Groups, result.groups);
          setLayer(3, merged);
        }
      } catch (e) {
        console.error("L3 update failed:", e);
      }
    }

    return { ...finalData, tagLayers: layers };
  }, [invokeClaudeApi]);

  // R-01: Only save idea after API success. On failure, restore input and show error.
  const handleSave = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setLoading(true);
    setLoadingMsg("分析中...");

    const existingTags = [...new Set(data.ideas.flatMap(i => i.tags || []))];
    const prompt = buildAnalysisPrompt(text, data.ideas, data.genres, existingTags, data.tagLayers);

    let result;
    try {
      result = await invokeClaudeApi(prompt);
    } catch (e) {
      // R-01: Restore input text and show error
      setInput(text);
      setError("分析に失敗しました: " + e.message);
      setLoading(false);
      setLoadingMsg("");
      return;
    }

    if (!result) {
      setInput(text);
      setError("分析結果の解析に失敗しました");
      setLoading(false);
      setLoadingMsg("");
      return;
    }

    const newIdea = {
      id: uid(),
      content: text,
      tags: result.tags || [],
      summary: result.summary || text.slice(0, 20),
      genre: result.genre?.id || null,
      // R-04: Persist serendipity in idea object
      serendipity: result.serendipity || [],
      createdAt: new Date().toISOString(),
    };

    // Save the new idea to Supabase immediately if authenticated
    if (userId) {
      try {
        await saveIdea(supabase, userId, newIdea);
      } catch (e) {
        setInput(text);
        setError("アイデアの保存に失敗しました: " + e.message);
        setLoading(false);
        setLoadingMsg("");
        return;
      }
    }

    let final = { ...data, ideas: [...data.ideas, newIdea] };

    // Genre handling
    if (result.genre && !final.genres.some(g => g.id === result.genre.id)) {
      final.genres = [...final.genres, { ...result.genre, idea_ids: [newIdea.id] }];
    } else if (result.genre) {
      final.genres = final.genres.map(g =>
        g.id === result.genre.id ? { ...g, idea_ids: [...new Set([...g.idea_ids, newIdea.id])] } : g
      );
    }

    // Genre reclassification every 5 ideas
    if (final.ideas.length >= 5 && final.ideas.length % 5 === 0) {
      setLoadingMsg("ジャンル再分類中...");
      try {
        const reclass = await invokeClaudeApi(buildReclassifyPrompt(final.ideas, final.genres));
        if (reclass?.genres) {
          final.genres = reclass.genres;
          // R-03: Validate genre assignment to handle orphans
          final.ideas = validateGenreAssignment(final.ideas, reclass.genres);
        }
      } catch (e) {
        console.error("Reclassification failed:", e);
      }
    }

    // Layer updates (additive)
    final = await updateLayers(final);

    setData(final);
    await safeSave(final);
    setLoading(false);
    setLoadingMsg("");
  }, [input, data, loading, userId, invokeClaudeApi, updateLayers, safeSave]);

  const handleDelete = useCallback(async (id) => {
    if (userId) {
      try {
        await deleteIdea(supabase, id);
      } catch (e) {
        setError("削除に失敗しました: " + e.message);
        return;
      }
    }
    const updated = {
      ...data,
      ideas: data.ideas.filter(i => i.id !== id),
      genres: data.genres.map(g => ({ ...g, idea_ids: g.idea_ids.filter(i => i !== id) })),
    };
    setData(updated);
    setSelectedId(null);
    await safeSave(updated);
  }, [data, userId, safeSave]);

  // R-10: Export JSON before reset
  const handleReset = useCallback(async () => {
    if (!confirm("全データを削除しますか？\nバックアップJSONをダウンロードしてから削除します。")) return;
    exportDataAsJSON(data);
    const empty = { ideas: [], genres: [], tagLayers: [] };
    setData(empty);
    setSelectedId(null);
    setError(null);
    await safeSave(empty);
  }, [data, safeSave]);

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
    if (userId) {
      const updatedIdea = updated.ideas.find(i => i.id === ideaId);
      if (updatedIdea) {
        try {
          await saveIdea(supabase, userId, updatedIdea);
        } catch (e) {
          setError("タグの保存に失敗しました: " + e.message);
        }
      }
    } else {
      await safeSave(updated);
    }
  }, [data, userId, safeSave]);

  const handleRemoveTag = useCallback(async (ideaId, tag) => {
    const updated = {
      ...data,
      ideas: data.ideas.map(i =>
        i.id === ideaId ? { ...i, tags: (i.tags || []).filter(t => t !== tag) } : i
      ),
    };
    setData(updated);
    if (userId) {
      const updatedIdea = updated.ideas.find(i => i.id === ideaId);
      if (updatedIdea) {
        try {
          await saveIdea(supabase, userId, updatedIdea);
        } catch (e) {
          setError("タグの保存に失敗しました: " + e.message);
        }
      }
    } else {
      await safeSave(updated);
    }
  }, [data, userId, safeSave]);

  const handleForceLayerUpdate = useCallback(async () => {
    if (allTags.length < 4) return;
    setLoading(true);
    setLoadingMsg("レイヤー再構築中...");
    const resetData = { ...data, tagLayers: [] };
    const updated = await updateLayers(resetData);
    setData(updated);
    await safeSave(updated);
    setLoading(false);
    setLoadingMsg("");
  }, [data, allTags, updateLayers, safeSave]);

  return {
    data,
    input, setInput,
    view, setView,
    loading, loadingMsg,
    selectedId, setSelectedId,
    tagInput, setTagInput,
    initLoading,
    error, setError,
    allTags,
    connections,
    selectedIdea,
    connectedIdeas,
    tagIndex,
    handleSave,
    handleDelete,
    handleReset,
    handleAddTag,
    handleRemoveTag,
    handleForceLayerUpdate,
  };
}
