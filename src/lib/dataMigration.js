import { loadLocal, saveIdea, saveGenres, saveTagLayers } from './api';
import { STORAGE_KEY } from './constants';

export async function migrateLocalToSupabase(supabase, userId) {
  const localData = loadLocal();
  if (!localData || !localData.ideas?.length) return false;

  // Save each idea
  for (const idea of localData.ideas) {
    await saveIdea(supabase, userId, idea);
  }

  // Save genres
  if (localData.genres?.length > 0) {
    await saveGenres(supabase, userId, localData.genres);
  }

  // Save tag layers
  if (localData.tagLayers?.length > 0) {
    await saveTagLayers(supabase, userId, localData.tagLayers);
  }

  // Clear localStorage after successful migration
  localStorage.removeItem(STORAGE_KEY);
  return true;
}
