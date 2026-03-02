# IdeaGraph - プロジェクトコンテキスト

## 概要
IdeaGraphは「書くだけでアイデアが自動でつながる」Write-only型のナレッジグラフアプリ。
Obsidianの[[リンク]]を、AIによる自動タグ付けで置き換えることで、技術的知識ゼロでもネットワーク思考ができるようにする。

将来的にはKOGOSE（植物の成長をメタファーにしたUnityアプリ）に統合予定。
現在はClaude Artifactのリアクティブ環境でプロトタイプを開発中。

## 技術スタック（現在）
- React (JSX, single file artifact)
- d3.js (グラフ描画)
- Tailwind CSS (utility classes only, no compiler)
- Claude Sonnet 4 API (タグ生成、ジャンル分類、レイヤー構築)
- window.storage (persistent key-value, Claude Artifact環境)

## 将来の移行先
- Flutter + Supabase (PostgreSQL + pgvector)
- タグ類似度はOpenAI text-embedding-3-smallのベクトル検索に置き換え

## アーキテクチャ

### データ構造
```
{
  ideas: [{ id, content, tags: string[], summary, genre, createdAt }],
  genres: [{ id, name, emoji, idea_ids: string[] }],
  tagLayers: [
    { level: 1, groups: [{ name, members: string[] }] },      // 類義語
    { level: 2, groups: [{ name, children: string[] }] },      // 上位概念
    { level: 3, groups: [{ name, children: string[] }] },      // 最上位概念
  ]
}
```

### コアロジック
1. **メモ保存時**: Claude APIでタグ(2-5個)、要約、ジャンル、セレンディピティを生成
2. **リンク計算**: `computeConnections()` が全メモ間でタグの共通レイヤーを探索
   - L0: 完全一致タグ (weight: 4)
   - L1: 同じ類義語グループ (weight: 3)
   - L2: 同じ上位概念 (weight: 2)
   - L3: 同じ最上位概念 (weight: 1)
3. **レイヤー更新**: 追加のみ（削除・再構築しない）
   - L1: ユニークタグ8個以上 & 未分類タグあり
   - L2: L1グループ5個以上 & 未分類L1あり
   - L3: L2グループ5個以上 & 未分類L2あり
4. **ジャンル再分類**: 5メモごとにClaude APIで全体再分類

### 設計原則
- **Write-only**: ユーザーは書くだけ。整理・リンク・分類はすべてAIが行う
- **積み上げ型**: レイヤーは追加のみ、再構築しない（リンク構造の安定性）
- **距離ベースリンク**: レイヤーが深いほど弱いリンク（ベクトル類似度の階層的近似）
- **適応的ジャンル**: メモ数に応じてジャンル数が自動調整

## ファイル構成
```
src/IdeaGraph.jsx   ... メインコンポーネント（全ロジック含む single file）
CLAUDE.md           ... このファイル
REVIEW.md           ... チームレビューの指摘事項と対応方針
```

## 編集時の注意事項
- このファイルはClaude Artifact（React JSX）として動作する前提
- localStorage/sessionStorageは使用禁止（window.storage APIのみ）
- 外部パッケージは限定的（d3, recharts, lodash, Three.js, etc.が利用可能）
- HTMLフォームタグ禁止（onClick/onChangeで対応）
- default exportが必須
