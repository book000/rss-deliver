# Gemini CLI 向け作業方針

## 目的

このドキュメントは、Gemini CLI がこのプロジェクトで作業する際のコンテキストと作業方針を定義します。

## 出力スタイル

- **言語**: 日本語で回答する
- **トーン**: 簡潔かつ明確に、専門的な内容を分かりやすく説明する
- **形式**: Markdown 形式で構造化された回答を提供する

## 共通ルール

- **会話言語**: 日本語
- **コミット規約**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う
  - 形式: `<type>(<scope>): <description>`
  - `<description>` は日本語で記載
  - 例: `feat(rss): 新しい RSS フィード取得機能を追加`
- **日本語と英数字の間**: 半角スペースを挿入する

## プロジェクト概要

- **名前**: rss-deliver
- **目的**: RSS フィードを収集し配信する自分用のサービス
- **主な機能**:
  - 複数のサービスから RSS フィードを収集
  - 削除された記事を追跡
  - RSS XML を生成して配信

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
- **コメント言語**: 日本語
- **エラーメッセージ**: 英語
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

## アーキテクチャ

- **ファイル構成**:
  - `src/main.ts`: メインエントリーポイント
  - `src/base-service.ts`: サービスの基底クラス
  - `src/services/`: 各 RSS サービスの実装
  - `src/model/`: データモデル定義
  - `src/utils/`: ユーティリティ関数

## 注意事項

- **認証情報**: API キーや認証情報を Git にコミットしない
- **ログ出力**: ログに個人情報や認証情報を出力しない
- **既存ルールの優先**: プロジェクトの既存のコーディング規約を優先する
- **パッケージマネージャー**: pnpm のみ使用可（npm や yarn は使用しない）

## 既知の制約

- **テストフレームワーク**: 現在未導入（将来的に Jest または Vitest を検討）
- **バイナリビルド**: canvas と sharp はネイティブバイナリを含むため、特定のアーキテクチャでのみビルドされる
- **CI/CD**: GitHub Actions で自動リントとビルドチェックが実行される

## Gemini CLI の役割

Gemini CLI は、以下の用途で使用されることを想定しています：

- **外部仕様の確認**: 外部 API や RSS フィードの最新仕様
- **最新情報の調査**: Node.js、TypeScript、pnpm の最新機能や変更点
- **外部依存の検証**: 使用しているライブラリの最新バージョンや互換性

## リポジトリ固有

### RSS サービス実装

新しい RSS サービスを追加する場合：

1. `src/services/` に新しいファイルを作成
2. `BaseService` を継承したクラスを定義
3. `information()` メソッドでサービス情報を返す
4. `collect()` メソッドで RSS アイテムを収集して返す
5. エラーハンドリングは統一されたパターンを使用
6. ログ出力は `@book000/node-utils` の Logger を使用

### pubDate の自動処理

- RSS アイテムの pubDate は `BaseService.processPubDates()` が自動的に処理する
- pubDate が設定されていない場合：
  1. 前回のフィードから引き継ぐ
  2. 削除記事履歴から復元
  3. 最後に現在時刻を設定

### 削除記事の追跡

- 削除された記事は `deleted-articles-tracker` で自動的に追跡される
- 履歴は JSON ファイルに永続化される
