# AI エージェント向け基本方針

## 目的

このファイルはすべての AI エージェントに共通する作業方針を定義します。

## 基本方針

### 言語使用ルール

- **会話言語**: 日本語
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語
- **日本語と英数字の間**: 半角スペースを挿入

### コミット規約

コミットメッセージと PR タイトルは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従ってください：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

- `<type>`: feat, fix, docs, style, refactor, test, chore のいずれか
- `<description>`: 日本語で簡潔に記述
- 例: `feat(rss): Zenn フィード収集機能を追加`

## 判断記録のルール

すべての判断は以下の形式で記録してください：

1. **判断内容**: 何を決定したか
2. **代替案**: 他にどのような選択肢があったか
3. **採用理由**: なぜその案を採用したか
4. **前提条件**: 判断の前提となる条件
5. **不確実性**: 判断に含まれる不確実性

**重要**: 仮定を事実のように扱わず、前提条件と不確実性を明示してください。

## プロジェクト概要

- **プロジェクト名**: rss-deliver
- **目的**: 複数のサービスから情報を収集し、RSS フィードを生成・配信する
- **主な機能**:
  - RSS フィード収集と生成
  - 削除された記事の追跡
  - HTML リストページの生成

## 技術スタック

- **言語**: TypeScript
- **ランタイム**: Node.js
- **パッケージマネージャー**: pnpm
- **リンター**: ESLint
- **フォーマッター**: Prettier

## 開発手順（概要）

1. **プロジェクト理解**
   - リポジトリの構造を確認
   - 既存のコードやドキュメントを読む
   - プロジェクトの目的と要件を理解

2. **依存関係インストール**
   ```bash
   pnpm install
   ```

3. **変更実装**
   - コーディング規約に従ってコードを記述
   - TypeScript の型定義を明示的に記述
   - 日本語でコメントを記載

4. **テストと Lint/Format 実行**
   ```bash
   # リント実行
   pnpm lint

   # 自動修正
   pnpm fix

   # 動作確認
   pnpm start
   ```

5. **コミット**
   - Conventional Commits に従う
   - センシティブな情報が含まれていないことを確認

## コーディング規約

### TypeScript

- 型定義は明示的に記述する
- `any` 型の使用は避ける
- インターフェースとタイプエイリアスを適切に使い分ける
- 非同期処理は `async/await` を使用する

### コメント記述

```typescript
/**
 * RSS フィードを取得する関数
 * @param url RSS フィードの URL
 * @returns RSS アイテムの配列
 */
async function fetchRssFeed(url: string): Promise<RssItem[]> {
  // RSS パーサーを初期化
  const parser = new XMLParser()

  // HTTP リクエストを実行
  const response = await axios.get(url)

  return parser.parse(response.data)
}
```

## セキュリティ / 機密情報

- **認証情報のコミット禁止**: API キーや認証情報を Git にコミットしない
- **ログへの機密情報出力禁止**: ログに個人情報や認証情報を出力しない
- **公開 RSS のみ**: このプロジェクトは公開 RSS フィードのみを収集します

## リポジトリ固有

### プロジェクト構造

```
src/
├── main.ts                 # メインエントリーポイント
├── base-service.ts         # ベースサービスクラス
├── types.d.ts              # 型定義
├── model/                  # データモデル
├── services/               # RSS サービス実装
└── utils/                  # ユーティリティ
```

### 新しいサービスの追加

新しい RSS サービスを追加する場合：

1. `src/services/` に新しいサービスファイルを作成
2. `BaseService` クラスを継承
3. `collect()` メソッドを実装
4. `information()` メソッドを実装
5. `src/main.ts` の `services` 配列に追加

### デプロイ

- GitHub Actions で定期的に実行されます
- RSS フィードは `output/` ディレクトリに生成されます
- Node.js のバージョンは `.node-version` ファイルで管理されています

### 注意事項

- パッケージマネージャーは pnpm のみを使用してください
- Renovate が作成した PR には追加コミットを行わないでください
- canvas、sharp などのネイティブモジュールを使用しているため、適切な環境が必要です
