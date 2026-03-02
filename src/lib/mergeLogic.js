// R-02 fix: Merge L1 groups using diff format from AI
// aiDiffResult: { add_to_existing: { "groupName": ["newTag1"] }, new_groups: [{ name, members }] }
export function mergeL1Groups(existingGroups, aiDiffResult) {
  const merged = existingGroups.map(g => ({ ...g, members: [...(g.members || [])] }));

  // Add new members to existing groups
  const addToExisting = aiDiffResult.add_to_existing || {};
  for (const [groupName, newMembers] of Object.entries(addToExisting)) {
    const group = merged.find(g => g.name === groupName);
    if (group) {
      const existingMemberSet = new Set(group.members);
      for (const member of newMembers) {
        if (!existingMemberSet.has(member)) {
          group.members.push(member);
          existingMemberSet.add(member);
        }
      }
    }
  }

  // Add new groups that don't already exist
  const existingNames = new Set(merged.map(g => g.name));
  for (const newGroup of aiDiffResult.new_groups || []) {
    if (!existingNames.has(newGroup.name)) {
      merged.push({ name: newGroup.name, members: [...(newGroup.members || [])] });
      existingNames.add(newGroup.name);
    }
  }

  return merged;
}

// R-02 fix: Merge L2/L3 groups where AI returns full groups
// Protects existing children, only adds new children, adds new groups
export function mergeLayerGroups(existingGroups, aiResultGroups) {
  const merged = existingGroups.map(g => ({ ...g, children: [...(g.children || [])] }));

  for (const aiGroup of aiResultGroups || []) {
    const existing = merged.find(g => g.name === aiGroup.name);
    if (existing) {
      // Protect existing children, only add new ones
      const existingChildSet = new Set(existing.children);
      for (const child of aiGroup.children || []) {
        if (!existingChildSet.has(child)) {
          existing.children.push(child);
          existingChildSet.add(child);
        }
      }
    } else {
      // Add new group that doesn't exist yet
      merged.push({ name: aiGroup.name, children: [...(aiGroup.children || [])] });
    }
  }

  return merged;
}

// R-03 fix: Validate genre assignments, set genre to null for orphaned ideas
export function validateGenreAssignment(ideas, reclassGenres) {
  // Build a map from idea ID to genre ID
  const ideaToGenre = {};
  for (const genre of reclassGenres) {
    for (const ideaId of genre.idea_ids || []) {
      ideaToGenre[ideaId] = genre.id;
    }
  }

  return ideas.map(idea => ({
    ...idea,
    genre: ideaToGenre[idea.id] !== undefined ? ideaToGenre[idea.id] : null,
  }));
}
