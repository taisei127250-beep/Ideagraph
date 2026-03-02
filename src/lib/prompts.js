// R-05 fix: Returns max 5 latest ideas per genre for use in prompts
export function getRepresentativeIdeas(ideas, genres) {
  if (genres.length === 0) return ideas.slice(-5);

  const result = [];
  const addedIds = new Set();

  for (const genre of genres) {
    const genreIdeas = (genre.idea_ids || [])
      .map(id => ideas.find(i => i.id === id))
      .filter(Boolean)
      .slice(-5); // max 5 latest per genre

    for (const idea of genreIdeas) {
      if (!addedIds.has(idea.id)) {
        result.push(idea);
        addedIds.add(idea.id);
      }
    }
  }

  return result;
}

export function buildAnalysisPrompt(content, ideas, genres, existingTags, tagLayers) {
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

  // R-05 fix: Use representative ideas (max 5 per genre) instead of all ideas
  const representativeIdeas = getRepresentativeIdeas(ideas, genres);
  const existingList = representativeIdeas.length > 0
    ? representativeIdeas.map(i => `- [${i.id}] ${i.summary || i.content.slice(0, 60)}`).join("\n")
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

${existingList ? `【既存メモ一覧】(セレンディピティ判定用)\n${existingList}\n` : ""}【タスク】
1. タグ2〜5個。既存タグ・グループの正規名を優先使用。新規は既存にない概念のみ。具体的かつ再利用可能な粒度で。
2. 15文字以内の要約
3. ジャンル割り当て（既存or新規提案）
${serendipitySection}

JSON形式のみ:
{"tags":["タグ1","タグ2"],"summary":"要約","genre":{"id":"string","name":"名前","emoji":"絵文字"},"serendipity":[{"idea_id":"既存メモID","insight":"説明","seed":"アイデアの種"}]}`;
}

// R-13 fix: Request diff format response instead of full groups
export function buildL1Prompt(allTags, existingL1Groups) {
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
{"add_to_existing": {"グループ名": ["新タグ1","新タグ2"]}, "new_groups": [{"name":"新グループ","members":["タグ1","タグ2"]}]}`;
}

export function buildL2Prompt(l1Groups, existingL2Groups) {
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

export function buildL3Prompt(l2Groups, existingL3Groups) {
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

export function buildReclassifyPrompt(ideas, prevGenres) {
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
