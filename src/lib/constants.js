export const STORAGE_KEY = "ideagraph-v4";

export const GENRE_COLORS = [
  "#818cf8","#f472b6","#fbbf24","#34d399","#60a5fa",
  "#a78bfa","#fb7185","#2dd4bf","#fb923c","#a3e635"
];

export const LAYER_COLORS = { 1: "#818cf8", 2: "#f472b6", 3: "#fbbf24" };

// R-07 fix: human-readable labels replacing 類義語/上位概念/最上位概念
export const LAYER_LABELS = { 1: "似たタグ", 2: "大きなまとまり", 3: "テーマ" };

export const LAYER_WEIGHTS = { 0: 4, 1: 3, 2: 2, 3: 1 };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function genreColor(genres, gid) {
  const i = genres.findIndex(g => g.id === gid);
  return i >= 0 ? GENRE_COLORS[i % GENRE_COLORS.length] : "#64748b";
}
