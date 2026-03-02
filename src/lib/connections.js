import { LAYER_WEIGHTS } from './constants';

export function buildTagIndex(tagLayers) {
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

export function getSharedLayer(tagA, tagB, tagIndex) {
  if (tagA === tagB) return { layer: 0, via: tagA };
  const a = tagIndex[tagA], b = tagIndex[tagB];
  if (!a || !b) return null;
  if (a.L1 && b.L1 && a.L1 === b.L1) return { layer: 1, via: a.L1 };
  if (a.L2 && b.L2 && a.L2 === b.L2) return { layer: 2, via: a.L2 };
  if (a.L3 && b.L3 && a.L3 === b.L3) return { layer: 3, via: a.L3 };
  return null;
}

export function computeConnections(ideas, tagLayers) {
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
        const weight = matches.reduce((sum, m) => sum + (LAYER_WEIGHTS[m.layer] || 0), 0);
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

// R-06 fix: Only compute pairs between newIdea and existingIdeas, keep existing connections
export function computeConnectionsIncremental(newIdea, existingIdeas, tagLayers, existingConnections) {
  const tagIndex = buildTagIndex(tagLayers);
  const tagsA = newIdea.tags || [];
  const newConnections = [];

  if (tagsA.length > 0) {
    for (const existing of existingIdeas) {
      const tagsB = existing.tags || [];
      if (tagsB.length === 0) continue;

      let bestLayer = Infinity;
      const matches = [];
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
        const weight = matches.reduce((sum, m) => sum + (LAYER_WEIGHTS[m.layer] || 0), 0);
        const viaSet = [...new Set(matches.map(m => `L${m.layer}:${m.via}`))];
        newConnections.push({
          source: newIdea.id,
          target: existing.id,
          weight,
          bestLayer,
          matches,
          viaLabels: viaSet,
        });
      }
    }
  }

  return [...existingConnections, ...newConnections];
}
