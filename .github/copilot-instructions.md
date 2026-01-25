# GitHub Copilot インストラクション

## プロジェクト概要

- **目的**: RSS フィードを収集し配信する自分用のサービス
- **主な機能**:
  - 複数のサービスから RSS フィードを収集
  - 削除された記事を追跡
  - RSS XML を生成して配信
- **対象ユーザー**: 開発者（個人用）

## 共通ルール

- **会話言語**: 日本語
- **コミット規約**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う
  - 形式: `<type>(<scope>): <description>`
  - `<description>` は日本語で記載
  - 例: `feat(rss): 新しい RSS フィード取得機能を追加`
- **日本語と英数字の間**: 半角スペースを挿入する

## 技術スタック

- **言語**: TypeScript (ESM)
- **ランタイム**: Node.js
- **パッケージマネージャー**: pnpm (10.28.1)
- **リンター**: ESLint
- **フォーマッター**: Prettier
- **主な依存関係**: axios, cheerio, fast-xml-parser, canvas, sharp, pdfjs-dist

## コーディング規約

- **フォーマット**: Prettier で自動整形
- **命名規則**:
  - クラス: PascalCase
  - 関数・変数: camelCase
  - 定数: UPPER_SNAKE_CASE
- **Lint / Format ルール**:
  - ESLint: eslint.config.mjs に従う
  - Prettier: .prettierrc.yml に従う
- **TypeScript**:
  - 型定義は明示的に記述する
  - `any` 型の使用は避ける
  - `skipLibCheck` での回避は禁止
- **ドキュメント**: 関数・インターフェースに JSDoc を日本語で記載

## 開発コマンド

```bash
# 依存関係のインストール
pnpm install

# 本番実行
pnpm start

# 開発モード（ファイル監視）
pnpm dev

# リント実行
pnpm lint
pnpm lint:eslint
pnpm lint:prettier
pnpm lint:tsc

# フォーマット修正
pnpm fix
pnpm fix:eslint
pnpm fix:prettier
```

## テスト方針

- **テストフレームワーク**: 現在テストフレームワークは未導入
- **テスト追加の方針**: 将来的にテストを追加する場合は、Jest または Vitest を使用することを推奨

## セキュリティ / 機密情報

- **認証情報**: API キーや認証情報を Git にコミットしない
- **ログ出力**: ログに個人情報や認証情報を出力しない
- **環境変数**: 機密情報は環境変数で管理する

## ドキュメント更新

以下のファイルを変更した場合は、関連ドキュメントを更新する：

- **package.json**: 開発コマンドの変更時
- **プロンプトファイル**: 技術スタックやプロジェクト要件の変更時
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `AGENTS.md`
  - `GEMINI.md`

## リポジトリ固有

### アーキテクチャ

- **ファイル構成**:
  - `src/main.ts`: メインエントリーポイント
  - `src/base-service.ts`: サービスの基底クラス
  - `src/services/`: 各 RSS サービスの実装
  - `src/model/`: データモデル定義
  - `src/utils/`: ユーティリティ関数

### RSS サービス実装パターン

新しい RSS サービスを追加する場合：

1. `BaseService` クラスを継承する
2. `information()` メソッドで ServiceInformation を返す
3. `collect()` メソッドで CollectResult を返す
4. エラーハンドリングは統一されたパターンを使用する
5. ログ出力は `@book000/node-utils` の Logger を使用する

### pubDate 処理

- RSS アイテムの pubDate は自動的に処理される
- pubDate が設定されていない場合:
  1. 前回のフィードから引き継ぐ
  2. 削除記事履歴から復元
  3. 最後に現在時刻を設定

### 削除記事の追跡

- 削除された記事は `deleted-articles-tracker` で追跡される
- 履歴は永続化され、将来の参照に利用される

### CI/CD

- GitHub Actions で自動リントとビルドチェックが実行される
- `master` ブランチへのマージ前に CI が成功する必要がある
- Node.js のバージョンは `.node-version` ファイルで管理される

### 注意事項

- pnpm 以外のパッケージマネージャーは使用しない（preinstall スクリプトで制限）
- canvas と sharp はネイティブバイナリを含むため、特定のアーキテクチャでのみビルドされる
