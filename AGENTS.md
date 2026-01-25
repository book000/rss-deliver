# AI エージェント向け作業方針

## 目的

このドキュメントは、一般的な AI エージェントがこのプロジェクトで作業する際の共通方針を定義します。

## 基本方針

- **会話言語**: 日本語
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語
- **コミット規約**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う
  - 形式: `<type>(<scope>): <description>`
  - `<description>` は日本語で記載
  - 例: `feat(rss): 新しい RSS フィード取得機能を追加`

## 判断記録のルール

すべての判断において、以下を明示すること：

1. **判断内容**: 何を決定したか
2. **代替案**: どのような選択肢があったか
3. **採用理由**: なぜその選択肢を選んだか
4. **前提条件**: 判断の基盤となる前提
5. **不確実性**: 仮定や不確実な要素

前提・仮定・不確実性を明示し、仮定を事実のように扱わないこと。

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
- **主な依存関係**: axios, cheerio, fast-xml-parser, canvas, sharp, pdfjs-dist

## コーディング規約

- **フォーマット**: Prettier で自動整形
- **命名規則**:
  - クラス: PascalCase
  - 関数・変数: camelCase
  - 定数: UPPER_SNAKE_CASE
- **TypeScript**:
  - 型定義は明示的に記述する
  - `any` 型の使用は避ける
  - `skipLibCheck` での回避は禁止
- **ドキュメント**: 関数・インターフェースに JSDoc を日本語で記載

## 開発手順（概要）

1. **プロジェクト理解**:
   - package.json とソースコードを確認
   - アーキテクチャを把握

2. **依存関係インストール**:
   ```bash
   pnpm install
   ```

3. **変更実装**:
   - 適切なブランチで作業（`feat/<description>` または `fix/<description>`）
   - コードを実装し、日本語コメントを追加

4. **テストと Lint / Format 実行**:
   ```bash
   pnpm lint
   pnpm fix
   pnpm start
   ```

5. **コミットと PR**:
   - Conventional Commits に従ってコミット
   - PR を作成し、CI が成功することを確認

## セキュリティ / 機密情報

- **認証情報**: API キーや認証情報を Git にコミットしない
- **ログ出力**: ログに個人情報や認証情報を出力しない
- **環境変数**: 機密情報は環境変数で管理する

## リポジトリ固有

### アーキテクチャ

- **ファイル構成**:
  - `src/main.ts`: メインエントリーポイント
  - `src/base-service.ts`: サービスの基底クラス
  - `src/services/`: 各 RSS サービスの実装
  - `src/model/`: データモデル定義
  - `src/utils/`: ユーティリティ関数

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
- pubDate が設定されていない場合、前回のフィードから引き継ぐか、削除記事履歴から復元し、最後に現在時刻を設定する

### 削除記事の追跡

- 削除された記事は `deleted-articles-tracker` で自動的に追跡される
- 履歴は JSON ファイルに永続化される

### パッケージマネージャー

- **pnpm のみ使用可**: preinstall スクリプトで制限されている
- npm や yarn は使用しない

### CI/CD

- GitHub Actions で自動リントとビルドチェックが実行される
- `master` ブランチへのマージ前に CI が成功する必要がある
- Node.js のバージョンは `.node-version` ファイルで管理される

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

# フォーマット修正
pnpm fix
```

## 注意事項

- 日本語と英数字の間には半角スペースを挿入する
- エラーメッセージに絵文字がある場合は統一する
- Renovate が作成した既存の PR に対して追加コミットや更新を行わない
- TypeScript の型チェックは厳格に行う（`skipLibCheck` は禁止）
