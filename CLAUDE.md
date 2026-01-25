# Claude Code 作業方針

## 目的

このドキュメントは、Claude Code がこのプロジェクトで作業する際の方針とプロジェクト固有のルールを定義します。

## 判断記録のルール

すべての判断は、以下の形式で記録すること：

1. **判断内容の要約**: 何を決定したか
2. **検討した代替案**: どのような選択肢があったか
3. **採用しなかった案とその理由**: なぜその選択肢を選ばなかったか
4. **前提条件・仮定・不確実性**: 判断の基盤となる前提、仮定、不確実な要素
5. **他エージェントによるレビュー可否**: 他のエージェント（Codex CLI、Gemini CLI）によるレビューが必要か

前提・仮定・不確実性を明示し、仮定を事実のように扱わないこと。

## プロジェクト概要

- **目的**: RSS フィードを収集し配信する自分用のサービス
- **主な機能**:
  - 複数のサービスから RSS フィードを収集
  - 削除された記事を追跡
  - RSS XML を生成して配信

## 重要ルール

- **会話言語**: 日本語
- **コミット規約**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う
  - 形式: `<type>(<scope>): <description>`
  - `<description>` は日本語で記載
  - 例: `feat(rss): 新しい RSS フィード取得機能を追加`
- **コード内コメント**: 日本語
- **エラーメッセージ**: 英語

## 環境のルール

- **ブランチ命名**: [Conventional Branch](https://conventional-branch.github.io) に従う
  - 形式: `<type>/<description>`
  - `<type>` は短縮形（feat, fix）を使用
  - 例: `feat/add-new-rss-service`
- **GitHub リポジトリ調査**: テンポラリディレクトリに git clone して調査する
- **Renovate PR**: Renovate が作成した既存の PR に対して追加コミットや更新を行わない

## コード改修時のルール

- **日本語と英数字の間**: 半角スペースを挿入する
- **既存のエラーメッセージ**: 先頭に絵文字がある場合は、全体で統一する
- **TypeScript の `skipLibCheck`**: 禁止
- **docstring**: 関数・インターフェースに JSDoc を日本語で記載

## 相談ルール

他エージェントに相談することができる。以下の観点で使い分ける：

### Codex CLI (ask-codex)

- 実装コードに対するソースコードレビュー
- 関数設計、モジュール内部の実装方針などの局所的な技術判断
- アーキテクチャ、モジュール間契約、パフォーマンス／セキュリティといった全体影響の判断
- 実装の正当性確認、機械的ミスの検出、既存コードとの整合性確認

### Gemini CLI (ask-gemini)

- Node.js の最新仕様や機能
- TypeScript の最新仕様や機能
- pnpm の最新仕様や機能
- 外部 API や RSS フィードの仕様
- 外部一次情報の確認、最新仕様の調査、外部前提条件の検証

### 指摘への対応

他エージェントが指摘・異議を提示した場合、以下のいずれかを行う。黙殺・無言での不採用は禁止する。

- 指摘を受け入れ、判断を修正する
- 指摘を退け、その理由を明示する

以下は必ず実施する：

- 他エージェントの提案を鵜呑みにせず、その根拠や理由を理解する
- 自身の分析結果と他エージェントの意見が異なる場合は、双方の視点を比較検討する
- 最終的な判断は、両者の意見を総合的に評価した上で、自身で下す

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

## アーキテクチャと主要ファイル

### アーキテクチャサマリー

このプロジェクトは、以下のコンポーネントで構成される：

1. **main.ts**: メインエントリーポイント
   - 各サービスの RSS フィードを生成
   - 削除記事を検出して履歴に保存
   - RSS XML ファイルを出力

2. **BaseService**: サービスの基底クラス
   - すべての RSS サービスが継承する抽象クラス
   - `information()`: サービス情報を返す
   - `collect()`: RSS アイテムを収集する
   - `processPubDates()`: pubDate を自動処理する

3. **services/**: 各 RSS サービスの実装
   - FF14 ロードストーン（ニュース、メンテナンス、障害、アップデート）
   - レタスクラブ（フィジカルアップ、理系）
   - Zenn Changelog
   - dev.1and
   - TDR Updates
   - Pop Team Epic
   - Fish 4koma

4. **utils/**: ユーティリティ関数
   - `previous-feed.ts`: 前回のフィード管理と pubDate 継承
   - `deleted-articles-tracker.ts`: 削除記事の追跡と履歴管理

5. **model/**: データモデル定義
   - `collect-result.ts`: 収集結果とアイテムの型定義
   - `service-information.ts`: サービス情報の型定義
   - `deleted-article.ts`: 削除記事の型定義

### 主要ディレクトリ

```
.
├── src/
│   ├── main.ts                 # メインエントリーポイント
│   ├── base-service.ts         # サービス基底クラス
│   ├── types.d.ts              # 型定義
│   ├── services/               # RSS サービス実装
│   ├── model/                  # データモデル
│   └── utils/                  # ユーティリティ関数
├── .github/
│   ├── workflows/              # GitHub Actions
│   └── copilot-instructions.md # GitHub Copilot 向けプロンプト
├── package.json                # パッケージ定義
├── tsconfig.json               # TypeScript 設定
├── eslint.config.mjs           # ESLint 設定
├── .prettierrc.yml             # Prettier 設定
└── template.html               # HTML テンプレート
```

## 実装パターン

### 推奨パターン

#### 新しい RSS サービスの追加

```typescript
import { BaseService } from '../base-service'
import CollectResult, { Item } from '../model/collect-result'
import ServiceInformation from '../model/service-information'
import { Logger } from '@book000/node-utils'
import axios from 'axios'

export default class NewRssService extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'サービス名',
      link: 'https://example.com',
      description: 'サービスの説明',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure(`${this.constructor.name}.collect`)

    try {
      // RSS フィードを取得
      const response = await axios.get('https://example.com/feed')

      // アイテムをパース
      const items: Item[] = []

      return {
        status: true,
        items,
      }
    } catch (error) {
      logger.error('Failed to collect RSS feed', error)
      return {
        status: false,
        items: [],
      }
    }
  }
}
```

#### エラーハンドリング

```typescript
try {
  // 処理
} catch (error) {
  logger.error('エラーメッセージ', error)
  return {
    status: false,
    items: [],
  }
}
```

#### ログ出力

```typescript
const logger = Logger.configure(`${this.constructor.name}.methodName`)
logger.info('📝 処理開始')
logger.warn('⚠️ 警告メッセージ')
logger.error('❌ エラーメッセージ', error)
```

### 非推奨パターン

- **`any` 型の使用**: 型を明示的に定義する
- **`skipLibCheck` の使用**: 禁止
- **エラーの無視**: すべてのエラーを適切にハンドリングする
- **グローバル変数**: 関数内で閉じた変数を使用する

## テスト

### テスト方針

- **テストフレームワーク**: 現在未導入（将来的に Jest または Vitest を検討）
- **動作確認**: `pnpm start` で実際に RSS フィードが生成されることを確認
- **Lint / Format チェック**: `pnpm lint` と `pnpm fix` で品質を保つ

### 追加テスト条件

変更を加えた場合、以下を確認する：

1. TypeScript のコンパイルエラーがないこと（`pnpm lint:tsc`）
2. ESLint のエラーがないこと（`pnpm lint:eslint`）
3. Prettier のフォーマットが正しいこと（`pnpm lint:prettier`）
4. 実際に RSS フィードが生成されること（`pnpm start`）
5. 削除記事が正しく追跡されること

## ドキュメント更新ルール

### 更新対象

以下のファイルを変更した場合は、関連ドキュメントを更新する：

- **package.json**: 開発コマンドの変更時
- **プロンプトファイル**: 技術スタックやプロジェクト要件の変更時
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `AGENTS.md`
  - `GEMINI.md`

### 更新タイミング

- 技術スタックの変更時
- 開発コマンドの変更時
- プロジェクト要件の変更時
- 品質チェックで問題検出時

## 作業チェックリスト

### 新規改修時

1. プロジェクトを理解する
2. 作業ブランチが適切であることを確認する
3. 最新のリモートブランチに基づいた新規ブランチであることを確認する
4. PR がクローズされた不要ブランチが削除済みであることを確認する
5. pnpm で依存関係をインストールする

### コミット・プッシュ前

1. Conventional Commits に従っていることを確認する
2. センシティブな情報が含まれていないことを確認する
3. Lint / Format エラーがないことを確認する（`pnpm lint`）
4. 動作確認を行う（`pnpm start`）

### PR 作成前

1. PR 作成の依頼があることを確認する
2. センシティブな情報が含まれていないことを確認する
3. コンフリクトの恐れがないことを確認する

### PR 作成後

1. コンフリクトがないことを確認する
2. PR 本文が最新状態のみを網羅していることを確認する
3. `gh pr checks <PR ID> --watch` で CI を確認する
4. Copilot レビューに対応し、コメントに返信する
5. Codex のコードレビューを実施し、信頼度スコアが 50 以上の指摘対応を行う
6. PR 本文の崩れがないことを確認する

## リポジトリ固有

### RSS サービス実装パターン

新しい RSS サービスを追加する場合：

1. `src/services/` に新しいファイルを作成
2. `BaseService` を継承したクラスを定義
3. `information()` と `collect()` メソッドを実装
4. `src/main.ts` にサービスを追加
5. ログ出力には `@book000/node-utils` の Logger を使用

### pubDate の自動処理

- `BaseService.processPubDates()` が自動的に pubDate を処理する
- pubDate が設定されていない場合：
  1. 前回のフィードから引き継ぐ
  2. 削除記事履歴から復元
  3. 最後に現在時刻を設定
- この処理は main.ts で自動的に呼ばれるため、サービス実装では意識不要

### 削除記事の追跡

- `deleted-articles-tracker.ts` が削除記事を自動的に追跡
- 履歴は JSON ファイルに保存される
- サービス実装では特別な処理は不要

### パッケージマネージャー

- **pnpm 以外は使用禁止**: preinstall スクリプトで制限されている
- **バイナリビルド**: canvas と sharp は特定のアーキテクチャでのみビルドされる

### CI/CD

- GitHub Actions で自動リントとビルドチェックが実行される
- `master` ブランチへのマージ前に CI が成功する必要がある
- Node.js のバージョンは `.node-version` ファイルで管理される
