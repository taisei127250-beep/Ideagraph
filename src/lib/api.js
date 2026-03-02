import { STORAGE_KEY } from './constants';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// R-09 fix: Throw errors instead of silently catching them
export function saveLocal(data) {
  const serialized = JSON.stringify(data);
  localStorage.setItem(STORAGE_KEY, serialized);
}

export async function callClaude(prompt) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Claude API error ${r.status}: ${errText}`);
  }

  const j = await r.json();
  const t = (j.content || []).map(c => c.text || "").join("");
  return JSON.parse(t.replace(/```json\n?|```\n?/g, "").trim());
}

// R-10 fix: Create Blob and trigger file download
export function exportDataAsJSON(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ideagraph-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Load all user data from Supabase in parallel
export async function loadUserData(supabase, userId) {
  const [ideasRes, genresRes, layersRes] = await Promise.all([
    supabase.from('ideas').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('genres').select('*').eq('user_id', userId),
    supabase.from('tag_layers').select('*').eq('user_id', userId).order('level', { ascending: true }),
  ]);

  if (ideasRes.error) throw new Error('Failed to load ideas: ' + ideasRes.error.message);
  if (genresRes.error) throw new Error('Failed to load genres: ' + genresRes.error.message);
  if (layersRes.error) throw new Error('Failed to load tag layers: ' + layersRes.error.message);

  // Transform ideas: genre_id → genre for frontend compatibility
  const ideas = (ideasRes.data || []).map(row => ({
    id: row.id,
    content: row.content,
    tags: row.tags || [],
    summary: row.summary,
    genre: row.genre_id,
    serendipity: row.serendipity || [],
    createdAt: row.created_at,
  }));

  const genres = genresRes.data || [];
  const tagLayers = (layersRes.data || []).map(row => ({
    level: row.level,
    groups: row.groups || [],
  }));

  return { ideas, genres, tagLayers };
}

export async function saveIdea(supabase, userId, idea) {
  const { error } = await supabase.from('ideas').upsert({
    id: idea.id,
    user_id: userId,
    content: idea.content,
    tags: idea.tags || [],
    summary: idea.summary,
    genre_id: idea.genre || null,
    serendipity: idea.serendipity || [],
    created_at: idea.createdAt,
  });
  if (error) throw new Error('Failed to save idea: ' + error.message);
}

export async function deleteIdea(supabase, ideaId) {
  const { error } = await supabase.from('ideas').delete().eq('id', ideaId);
  if (error) throw new Error('Failed to delete idea: ' + error.message);
}

export async function saveGenres(supabase, userId, genres) {
  // Delete existing genres for user, then insert new ones
  const { error: delError } = await supabase.from('genres').delete().eq('user_id', userId);
  if (delError) throw new Error('Failed to delete genres: ' + delError.message);

  if (genres.length > 0) {
    const rows = genres.map(g => ({
      id: g.id,
      user_id: userId,
      name: g.name,
      emoji: g.emoji,
      idea_ids: g.idea_ids || [],
    }));
    const { error: insError } = await supabase.from('genres').insert(rows);
    if (insError) throw new Error('Failed to insert genres: ' + insError.message);
  }
}

export async function saveTagLayers(supabase, userId, tagLayers) {
  for (const layer of tagLayers) {
    const { error } = await supabase.from('tag_layers').upsert({
      user_id: userId,
      level: layer.level,
      groups: layer.groups || [],
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('Failed to save tag layer: ' + error.message);
  }
}

export async function callClaudeViaProxy(supabase, prompt) {
  const { data, error } = await supabase.functions.invoke('claude-proxy', {
    body: { prompt, model: 'claude-sonnet-4-20250514', max_tokens: 2000 },
  });
  if (error) throw new Error('Claude proxy error: ' + error.message);
  if (typeof data === 'string') {
    return JSON.parse(data.replace(/```json\n?|```\n?/g, '').trim());
  }
  return data;
}

// Load ALL users' data for integrated view (RLS allows SELECT for all)
export async function loadAllUsersData(supabase) {
  const [profilesRes, ideasRes, genresRes, layersRes] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('ideas').select('*').order('created_at', { ascending: true }),
    supabase.from('genres').select('*'),
    supabase.from('tag_layers').select('*').order('level', { ascending: true }),
  ]);

  if (profilesRes.error) throw new Error('Failed to load profiles: ' + profilesRes.error.message);
  if (ideasRes.error) throw new Error('Failed to load all ideas: ' + ideasRes.error.message);
  if (genresRes.error) throw new Error('Failed to load all genres: ' + genresRes.error.message);
  if (layersRes.error) throw new Error('Failed to load all tag layers: ' + layersRes.error.message);

  const profiles = profilesRes.data || [];

  // Transform ideas keeping user_id for multi-user color mapping
  const ideas = (ideasRes.data || []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    tags: row.tags || [],
    summary: row.summary,
    genre: row.genre_id,
    serendipity: row.serendipity || [],
    createdAt: row.created_at,
  }));

  const genres = genresRes.data || [];

  // Group tag_layers by user_id
  const layersByUser = {};
  for (const row of layersRes.data || []) {
    if (!layersByUser[row.user_id]) layersByUser[row.user_id] = [];
    layersByUser[row.user_id].push({ level: row.level, groups: row.groups || [] });
  }

  return { profiles, ideas, genres, layersByUser };
}
