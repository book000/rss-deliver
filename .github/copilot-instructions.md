# GitHub Copilot インストラクション

このファイルは rss-deliver プロジェクトで GitHub Copilot を使用する際のガイドラインです。

## 必須要件

### コミュニケーション言語

**すべてのコミュニケーションは日本語で行ってください。**

- Issue タイトル・本文: 日本語で記述
- PR タイトル・本文: 日本語で記述（Conventional Commits の仕様に従う）
- コミットメッセージ: 日本語で記述（Conventional Commits の仕様に従う）
- レビューコメント: 日本語で記述
- コード内コメント: 日本語で記述

### Conventional Commits 仕様

コミットメッセージと PR タイトルは以下の形式に従ってください:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Type 一覧

`<type>` は以下のいずれかを使用:

- `feat`: 新機能追加
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードフォーマット変更
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: その他の変更

#### 記述ルール

- `<description>` は日本語で簡潔に記述してください
- `[optional body]` は変更の詳細な説明を日本語で記述します
- 全ての Heading とその本文の間には、空白行を入れる
- 英数字と日本語の間には、半角スペースを入れる

#### コミットメッセージ例

```
feat(rss): 新しい RSS フィード取得機能を追加

FF14 ロードストーンの新しいフィード形式に対応。
パーサーロジックを改善し、エラーハンドリングを強化。

Closes #123
```

## プロジェクト固有のガイドライン

### 技術スタック

- **言語**: TypeScript
- **ランタイム**: Node.js
- **パッケージマネージャー**: pnpm
- **リンター**: ESLint
- **フォーマッター**: Prettier
- **ビルドツール**: TypeScript Compiler (tsc)

### 開発フロー

#### 依存関係管理

```bash
# 依存関係のインストール
pnpm install

# 新しい依存関係の追加
pnpm add <package-name>
pnpm add -D <package-name>  # 開発依存関係
```

#### コード品質チェック

```bash
# リント実行
pnpm lint

# フォーマット修正
pnpm fix

# 型チェック
pnpm lint:tsc
```

#### 実行

```bash
# 本番実行
pnpm start

# 開発モード（ファイル監視）
pnpm dev
```

### コーディング規約

#### TypeScript

- 型定義は明示的に記述する
- `any` 型の使用は避ける
- インターフェースとタイプエイリアスを適切に使い分ける
- 非同期処理は `async/await` を使用する

#### ファイル構成

- `src/main.ts`: メインエントリーポイント
- `src/services/`: RSS サービスの実装
- `src/model/`: データモデル定義
- `src/utils/`: ユーティリティ関数
- `src/types.d.ts`: 型定義

#### コメント記述

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

### Issue と PR の記述

#### Issue テンプレート

```markdown
## 概要

新機能や修正内容の概要を日本語で記述

## 詳細

実装の詳細や技術的な検討事項

## 受け入れ条件

- [ ] 条件 1
- [ ] 条件 2
- [ ] 条件 3
```

#### PR テンプレート

```markdown
## 変更内容

このPRでの変更内容を日本語で説明

## 関連 Issue

Closes #123

## テスト

- [ ] 既存テストがパスすることを確認
- [ ] 新機能のテストを追加（該当する場合）
- [ ] リント、フォーマットチェックがパスすることを確認
```

### レビューガイドライン

#### レビューコメント例

```markdown
コードの品質について:
- TypeScript の型定義をより具体的にしてください
- エラーハンドリングを追加することを推奨します

動作について:
- この実装だと edge case で問題が発生する可能性があります
- ログ出力を追加して debugging しやすくしてください
```

#### 承認基準

- [ ] コードが動作要件を満たしている
- [ ] TypeScript の型チェックがパスしている
- [ ] ESLint と Prettier のチェックがパスしている
- [ ] 適切な日本語コメントが記述されている
- [ ] セキュリティリスクがない

## その他の注意事項

### RSS サービス実装

- 新しい RSS サービスは `BaseService` クラスを継承する
- エラーハンドリングは統一されたパターンを使用する
- ログ出力は `@book000/node-utils` の Logger を使用する

### 依存関係の更新

- Renovate が自動で依存関係の更新 PR を作成します
- セキュリティアップデートは優先的にマージしてください
- Breaking changes を含む更新は慎重に検討してください

### CI/CD

- GitHub Actions で自動テストとリントが実行されます
- `main` ブランチへのマージ前に CI が成功する必要があります
- Node.js のバージョンは `.node-version` ファイルで管理されています