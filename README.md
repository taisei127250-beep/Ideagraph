# IdeaGraph

Write-only型のAIナレッジグラフ。書くだけでアイデアが自動でつながる。

## セットアップ

### Claude Codeで開発を始める

```bash
cd ideagraph-project
claude
```

Claude Codeが `CLAUDE.md` を自動で読み込み、プロジェクトの文脈を理解します。

### 最初の指示例

```
# レビュー指摘を順に修正
REVIEW.mdの指摘をR-01から順に修正して

# 特定の指摘だけ修正
R-02のL1マージロジックを実装して

# 新機能追加
メモの検索機能を追加して

# コード理解
computeConnectionsの処理フローを説明して
```

## ファイル構成

```
CLAUDE.md          ... Claude Code用プロジェクトコンテキスト（自動読み込み）
REVIEW.md          ... レビュー指摘事項（13件、優先度付き）
README.md          ... このファイル
src/
  IdeaGraph.jsx    ... メインコンポーネント（~960行、single file）
```

## 注意事項

- `src/IdeaGraph.jsx` はClaude Artifact環境で動作するReact JSXファイル
- ローカルで動かすにはVite + React環境が必要（ただしwindow.storage APIはArtifact専用）
- 編集後はClaude.aiのArtifactに貼り戻して動作確認するフローを想定
