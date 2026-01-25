# Gemini CLI 向けコンテキスト

## 目的

このファイルは Gemini CLI 向けのコンテキストと作業方針を定義します。

## 出力スタイル

- **言語**: 日本語
- **トーン**: 丁寧かつ明確
- **形式**: 構造化された説明

## 共通ルール

### 言語使用ルール

- **会話言語**: 日本語
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語
- **日本語と英数字の間**: 半角スペースを挿入

### コミット規約

コミットメッセージと PR タイトルは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従ってください：

```
<type>(<scope>): <description>
```

- `<type>`: feat, fix, docs, style, refactor, test, chore のいずれか
- `<description>`: 日本語で簡潔に記述
- 例: `feat(rss): Zenn フィード収集機能を追加`

## プロジェクト概要

### 目的

複数のサービス（Zenn、FF14 Lodestone、LettuceClub など）から情報を収集し、RSS フィードを生成・配信するシステムです。

### 主な機能

1. **RSS フィード収集**: 複数のサービスから RSS フィードを取得
2. **削除記事追跡**: フィード間の差分を検出し、削除された記事を記録
3. **フィード生成**: XML 形式の RSS フィードを生成
4. **リストページ生成**: すべてのフィードをリスト表示する HTML ページを生成

### 対象サービス

- Zenn Changelog
- FF14 Lodestone（ニュース、メンテナンス、障害、アップデート）
- LettuceClub（フィジカルアップ、理系2.0）
- dev1and
- TDR Updates
- Pop Team Epic
- Fish 4-Koma

## 技術スタック

- **言語**: TypeScript 5.9.3
- **ランタイム**: Node.js（`.node-version` で管理）
- **パッケージマネージャー**: pnpm 10.28.1
- **リンター**: ESLint 9.39.2
- **フォーマッター**: Prettier 3.8.1
- **ビルドツール**: tsx（TypeScript 実行）

### 主要ライブラリ

- `fast-xml-parser`: RSS フィードの解析と生成
- `axios`: HTTP リクエスト
- `cheerio`: HTML スクレイピング
- `@book000/node-utils`: ログ出力など
- `canvas`, `sharp`: 画像処理
- `pdfjs-dist`: PDF 処理

## コーディング規約

### TypeScript

- 型定義は明示的に記述する
- `any` 型の使用は避ける
- `skipLibCheck` での回避は禁止
- インターフェースとタイプエイリアスを適切に使い分ける
- 非同期処理は `async/await` を使用する

### 命名規則

- クラス名: PascalCase（例: `BaseService`）
- 関数名: camelCase（例: `fetchRssFeed`）
- 定数: UPPER_SNAKE_CASE（例: `MAX_RETRY_COUNT`）
- ファイル名: kebab-case（例: `zenn-changelog.ts`）

### コメント言語

- コード内コメント: 日本語
- docstring (JSDoc): 日本語

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

### エラーメッセージ

エラーメッセージは英語で記述します。

```typescript
throw new Error('Failed to fetch RSS feed')
```

## 開発コマンド

```bash
# 依存関係のインストール
pnpm install

# 本番実行
pnpm start

# 開発モード（ファイル監視）
pnpm dev

# リント実行（Prettier + ESLint + TypeScript）
pnpm lint

# リント自動修正
pnpm fix

# 個別のリントコマンド
pnpm lint:prettier  # Prettier チェック
pnpm lint:eslint    # ESLint チェック
pnpm lint:tsc       # TypeScript 型チェック

# 個別の自動修正コマンド
pnpm fix:prettier   # Prettier 自動修正
pnpm fix:eslint     # ESLint 自動修正
```

## アーキテクチャ

### ディレクトリ構成

```
src/
├── main.ts                      # メインエントリーポイント
├── base-service.ts              # ベースサービスクラス
├── types.d.ts                   # 型定義
├── model/                       # データモデル
│   ├── collect-result.ts        # 収集結果モデル
│   ├── deleted-article.ts       # 削除記事モデル
│   └── service-information.ts   # サービス情報モデル
├── services/                    # RSS サービス実装
│   ├── zenn-changelog.ts        # Zenn 変更履歴
│   ├── ff14-lodestone-news.ts   # FF14 ニュース
│   └── ...                      # その他のサービス
└── utils/                       # ユーティリティ
    ├── previous-feed.ts         # 前回フィード管理
    └── deleted-articles-tracker.ts # 削除記事追跡
```

### 主要コンポーネント

1. **BaseService**: すべての RSS サービスが継承するベースクラス
   - `collect()`: フィード収集ロジック
   - `information()`: サービス情報の返却
   - `processPubDates()`: 公開日時の処理

2. **サービス実装**: 各サービス固有の RSS 収集ロジック
   - `BaseService` を継承
   - サービス固有のスクレイピングや API 呼び出しを実装

3. **削除記事追跡**: フィード間の差分を検出し、削除された記事を記録
   - 前回のフィードと現在のフィードを比較
   - 削除された記事を JSON ファイルに保存

4. **フィード生成**: XML 形式の RSS フィードを生成
   - `fast-xml-parser` を使用
   - `output/` ディレクトリに保存

## 注意事項

### セキュリティ / 機密情報

- **認証情報のコミット禁止**: API キーや認証情報を Git にコミットしない
- **ログへの機密情報出力禁止**: ログに個人情報や認証情報を出力しない
- **公開 RSS のみ**: このプロジェクトは公開 RSS フィードのみを収集します

### 既存ルールの優先

- プロジェクトの既存のコーディングスタイルやパターンを優先する
- 新しいサービスを追加する場合は、既存のサービスの実装を参考にする
- エラーハンドリングは既存のパターンに従う

### 既知の制約

- **Node.js バージョン**: `.node-version` ファイルで管理されています
- **パッケージマネージャー**: pnpm のみを使用してください（npm や yarn は使用不可）
- **ネイティブモジュール**: canvas、sharp などのネイティブモジュールを使用しているため、適切な環境が必要です
- **GitHub Actions**: 定期的に実行されます。CI の設定は `.github/workflows/` で管理されています

## リポジトリ固有

### デプロイ

- GitHub Actions で定期的に実行されます
- RSS フィードは `output/` ディレクトリに生成されます
- GitHub Pages などでホスティングされる可能性があります

### Renovate

- Renovate が依存関係の更新 PR を自動作成します
- Renovate PR には追加コミットを行わないでください

### 新しいサービスの追加手順

1. `src/services/` に新しいサービスファイルを作成
2. `BaseService` クラスを継承
3. `collect()` メソッドを実装（RSS アイテムの収集ロジック）
4. `information()` メソッドを実装（サービス情報の定義）
5. `src/main.ts` の `services` 配列に新しいサービスのインスタンスを追加
6. 動作確認（`pnpm start` で実行し、`output/` にフィードが生成されることを確認）

### 外部依存の調査方法

Gemini CLI は最新の情報を調査する際に使用されます。以下のような場合に活用してください：

- 外部サービスの API 仕様変更の確認
- ライブラリのバージョンアップに伴う変更点の調査
- Node.js のバージョンアップに伴う互換性の確認
- 外部 RSS フィードの仕様変更の調査
