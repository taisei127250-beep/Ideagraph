import { genreColor } from '../lib/constants';

export default function GenreChips({ genres }) {
  if (genres.length === 0) return null;
  return (
    <div className="flex gap-1.5 px-4 py-1.5 overflow-x-auto border-b border-slate-800/50">
      {genres.map(g => (
        <span key={g.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap"
          style={{ backgroundColor: genreColor(genres, g.id) + "22", color: genreColor(genres, g.id), border: `1px solid ${genreColor(genres, g.id)}44` }}>
          {g.emoji} {g.name}
          <span className="opacity-60">{g.idea_ids.length}</span>
        </span>
      ))}
    </div>
  );
}
