# IdeaGraph レビュー指摘事項

## 優先度: 🔴 高（データ破損リスク）

### R-01: APIエラー時のロールバック未実装
- **場所**: `handleSave()` (L473-517)
- **問題**: 最初に空のアイデア（タグなし・要約なし）をsave→API呼び出し→成功時に上書き。API失敗時に空メモが永続化される
- **対応**: API失敗時はアイデアをリストから削除してロールバック。楽観的更新をやめ、API成功後にのみ追加する
```
// 現状（危険）
const updated = { ...data, ideas: [...data.ideas, newIdea] };
setData(updated);
await save(updated);  // ← 空メモが永続化
const result = await claude(prompt);  // ← 失敗したら空メモが残る

// 改善案
setLoading(true);
const result = await claude(prompt);
if (result) {
  const enriched = { ...newIdea, tags: result.tags, ... };
  const updated = { ...data, ideas: [...data.ideas, enriched] };
  setData(updated);
  await save(updated);
} else {
  // エラー通知UI表示
}
```

### R-02: L1プロンプトの返却値で既存グループが上書きされるリスク
- **場所**: `updateLayers()` L435-436, `buildL1Prompt()` L191-218
- **問題**: AIに「既存グループは変更不可」と指示しているが、返却値を `setLayer(1, result.groups)` で丸ごと上書き。AIが既存グループのmembersを微妙に変えたらそのまま反映される
- **対応**: 返却値をマージロジックで処理し、既存グループのmembersは保護する
```
// 改善案: マージロジック
function mergeL1Groups(existing, aiResult) {
  const existingMap = new Map(existing.map(g => [g.name, g]));
  const merged = [...existing]; // 既存はそのまま保持
  for (const g of aiResult) {
    if (!existingMap.has(g.name)) {
      merged.push(g); // 新グループのみ追加
    } else {
      // 既存グループには新メンバーのみ追加（削除しない）
      const orig = existingMap.get(g.name);
      const newMembers = (g.members || []).filter(m => !(orig.members || []).includes(m));
      if (newMembers.length > 0) {
        orig.members = [...(orig.members || []), ...newMembers];
      }
    }
  }
  return merged;
}
```

### R-03: ジャンル再分類でorphan化
- **場所**: `handleSave()` 内のジャンル再分類ブロック (L505-513)
- **問題**: AIが一部のメモIDを返さなかった場合、そのメモのgenreが旧IDのまま残る。genresからは消えているのにidea.genreは古い値を指す
- **対応**: 再分類後にバリデーションを追加
```
// 改善案
const validGenreIds = new Set(reclass.genres.map(g => g.id));
final.ideas = final.ideas.map(idea => {
  const g = reclass.genres.find(g => g.idea_ids.includes(idea.id));
  if (g) return { ...idea, genre: g.id };
  // どのジャンルにも含まれないメモ → genreをnullに
  return { ...idea, genre: null };
});
```

---

## 優先度: 🟡 中（UX・パフォーマンス）

### R-04: セレンディピティが揮発性
- **場所**: `serendipity` state (L387), 表示部 (L642-668)
- **問題**: セレンディピティはReact stateでしか保持されず、画面遷移やリロードで消える。プロダクトの差別化要素が使い捨て
- **対応**: ideaオブジェクトに `serendipity` フィールドを追加して永続化。詳細パネルでも表示
```
// idea構造に追加
{ id, content, tags, summary, genre, createdAt, serendipity: [{idea_id, insight, seed}] }
```

### R-05: プロンプトのトークン爆発
- **場所**: `buildAnalysisPrompt()` L162-163
- **問題**: 既存メモ一覧を全件送信。50メモで~3,000トークン、200メモで~12,000トークン
- **対応**: セレンディピティ判定用のメモ一覧を「各ジャンルの代表5件」に絞る
```
// 改善案
const representatives = genres.flatMap(g => {
  const genreIdeas = ideas.filter(i => i.genre === g.id);
  return genreIdeas.slice(-5); // 各ジャンルから最新5件
});
```

### R-06: computeConnectionsのO(n²×t²)
- **場所**: `computeConnections()` L76-115
- **問題**: 全メモペア × 全タグペアの総当たり。200メモ×4タグで~80,000回のgetSharedLayer呼び出し
- **対応**: 
  - 短期: 新メモ追加時は既存コネクションを保持し、新メモに関するペアだけ計算
  - 長期: 逆引きインデックス（tag→idea_ids）を構築して探索を効率化

### R-07: レイヤービューが開発者向け
- **場所**: view === "layers" セクション (L774-850)
- **問題**: 「L1: 類義語」「L2: 上位概念」の表現が一般ユーザーに理解できない
- **対応案**:
  - メインナビから外して「設定」に格納
  - または表現を変える: L1→「似たタグ」、L2→「大きなまとまり」、L3→「テーマ」
  - リンク強度も「完全一致/類義語/上位概念/最上位」→「強/中/弱」に

### R-08: 詳細パネルの情報過多
- **場所**: タグ表示 L881-892, リンク表示 L909-935
- **問題**: タグ横のレイヤー情報（`·フロントエンド`）、リンクの強度ラベルがノイズ
- **対応**: レイヤー情報はホバー時のツールチップに隠す。リンク強度は色だけで表現

---

## 優先度: 🟢 低（改善・将来対応）

### R-09: save失敗時のユーザー通知
- **場所**: `save()` L124-126
- **問題**: catch内がconsole.errorのみ。window.storageの5MB上限到達時にサイレント失敗
- **対応**: エラーstateを追加し、フッター付近にエラーバナーを表示

### R-10: リセットの危険性
- **場所**: `handleReset()` L526-531
- **問題**: confirm()1回で全データ不可逆削除
- **対応**: リセット前にJSON exportを提供。または「30日間のゴミ箱」

### R-11: オンボーディング体験の空白
- **場所**: 全体設計
- **問題**: 最初の8メモまでレイヤーが生成されず、リンクがほぼ見えない
- **対応**: L0（完全一致タグ）のリンクはレイヤーなしで常に表示されることを確認。最初の3-5メモで「つながりが見えた」体験を作る

### R-12: GraphViewのsvg高さ問題
- **場所**: GraphView内 `<svg className="w-full h-full" />`
- **問題**: ブラウザによってはsvgに明示的な高さがないと0pxになる可能性
- **対応**: `style={{ width: '100%', height: '100%' }}` を明示

### R-13: L1プロンプトを差分返却に変更
- **場所**: `buildL1Prompt()` L191-218
- **問題**: 全グループ返却を求めているため、R-02の問題が生じる
- **対応**: 差分だけ返させるプロンプト設計に変更
```
JSON形式:
{"add_to_existing": {"グループ名": ["新タグ1"]}, "new_groups": [{"name":"新グループ","members":["タグ"]}]}
```

---

## 推奨着手順序
1. R-01 (APIエラーロールバック) → データ安全性
2. R-02 (L1マージロジック) → レイヤー安定性  
3. R-03 (ジャンルorphan修正) → データ整合性
4. R-04 (セレンディピティ永続化) → コアバリュー
5. R-05 (トークン最適化) → コスト・レイテンシ
6. 残りはR-06以降を順次
