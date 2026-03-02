import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { loadAllUsersData } from '../lib/api';
import { computeConnections, buildTagIndex } from '../lib/connections';
import { GENRE_COLORS } from '../lib/constants';

// Merge tag layer groups from multiple users
function mergeAllTagLayers(layersByUser) {
  const merged = [];

  for (let level = 1; level <= 3; level++) {
    const allGroups = [];

    for (const userId in layersByUser) {
      const userLayers = layersByUser[userId];
      const layer = userLayers.find(l => l.level === level);
      if (layer) {
        for (const group of layer.groups) {
          allGroups.push(group);
        }
      }
    }

    if (allGroups.length === 0) continue;

    // Merge groups with same name
    const groupMap = new Map();
    for (const g of allGroups) {
      if (groupMap.has(g.name)) {
        const existing = groupMap.get(g.name);
        if (level === 1) {
          // L1: merge members
          const memberSet = new Set(existing.members || []);
          for (const m of g.members || []) memberSet.add(m);
          existing.members = [...memberSet];
        } else {
          // L2/L3: merge children
          const childSet = new Set(existing.children || []);
          for (const c of g.children || []) childSet.add(c);
          existing.children = [...childSet];
        }
      } else {
        groupMap.set(g.name, {
          name: g.name,
          ...(level === 1
            ? { members: [...(g.members || [])] }
            : { children: [...(g.children || [])] }
          ),
        });
      }
    }

    merged.push({ level, groups: [...groupMap.values()] });
  }

  return merged;
}

// Merge genres from multiple users
function mergeAllGenres(genres) {
  // Just return all genres, keeping user_id for reference
  return genres;
}

export default function useMultiUser(currentUserId, isIntegratedView) {
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isIntegratedView || !currentUserId) {
      setAllData(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await loadAllUsersData(supabase);
        if (!cancelled) setAllData(data);
      } catch (e) {
        console.error('Failed to load multi-user data:', e);
      }
      if (!cancelled) setLoading(false);
    }

    load();

    // Realtime subscription for live updates
    const channel = supabase
      .channel('public:ideas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => {
        // Reload all data on any change
        load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId, isIntegratedView]);

  // Build user color map
  const userColorMap = useMemo(() => {
    if (!allData?.profiles) return {};
    const map = {};
    allData.profiles.forEach((p, i) => {
      map[p.id] = p.avatar_color || GENRE_COLORS[i % GENRE_COLORS.length];
    });
    return map;
  }, [allData?.profiles]);

  // Merge tag layers
  const mergedTagLayers = useMemo(() => {
    if (!allData?.layersByUser) return [];
    return mergeAllTagLayers(allData.layersByUser);
  }, [allData?.layersByUser]);

  // Merge genres
  const mergedGenres = useMemo(() => {
    if (!allData?.genres) return [];
    return mergeAllGenres(allData.genres);
  }, [allData?.genres]);

  // Merged ideas (all users)
  const mergedIdeas = useMemo(() => {
    return allData?.ideas || [];
  }, [allData?.ideas]);

  // Compute connections on merged data
  const mergedConnections = useMemo(() => {
    if (mergedIdeas.length === 0) return [];
    return computeConnections(mergedIdeas, mergedTagLayers);
  }, [mergedIdeas, mergedTagLayers]);

  const profiles = allData?.profiles || [];

  if (!isIntegratedView) return null;

  return {
    mergedIdeas,
    mergedGenres,
    mergedTagLayers,
    mergedConnections,
    userColorMap,
    profiles,
    loading,
  };
}
