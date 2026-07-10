# Copilot code review instructions

RSS フィードを収集・配信する個人用の TypeScript (ESM) プロジェクト。ランタイムは Node.js、パッケージマネージャーは pnpm。レビューコメントは日本語で行う。

## レビューの重点

- **HTTP クライアント**: 通信は組み込みの `fetch` を使う。`axios` などの HTTP クライアント依存を新規に追加する変更はフラグする（依存に含まれていない）。
- **型安全性**: `any` の新規追加、`skipLibCheck` の有効化、`@ts-ignore` / `@ts-expect-error` による型エラーの握りつぶしを指摘する。型は明示的に宣言する。
- **エラーハンドリング**: 各サービスの `collect()` は例外を握って `{ status: false, items: [] }` を返す方式。個別サービスの失敗で全体が落ちないこと、`catch` でエラーを握り潰して黙って成功扱いにしていないことを確認する。
- **ログ / エラーメッセージ**: ログ文字列とエラーメッセージは英語。コード内コメントと JSDoc は日本語。
- **pubDate / 削除記事**: `BaseService.processPubDates()` と `deleted-articles-tracker` が自動処理する。個別サービスでこれらを重複実装・上書きしていないか確認する。
- **秘匿情報**: API キー・認証情報・個人情報をコード、ログ、コミットに含めないこと。

## コーディング規約(lint / formatter で強制)

- ESLint (`eslint.config.mjs`, `@book000/eslint-config` 準拠) と Prettier (`.prettierrc.yml`) に従う。整形・lint 由来の指摘は CI で機械的に検出されるため、レビューでは実質的な問題を優先する。
- 命名: クラス `PascalCase`、関数・変数 `camelCase`、定数 `UPPER_SNAKE_CASE`。
- 日本語と英数字の間に半角スペースを入れる。
- `src` 配下の import は `@/*` エイリアス(`tsconfig.json` で `src/*` にマッピング)を使う。

## 新しい RSS サービス

`src/services/` に `BaseService` を継承したクラスを追加し、`information()` と `collect()` を実装したうえで `src/main.ts` の `services` 配列に登録する。この登録漏れがないか確認する。ログは `@book000/node-utils` の `Logger` を使う。

## フラグ不要な既知パターン(誤検知しやすい点)

- `pnpm start` / `pnpm dev` が `tsx` で TypeScript を直接実行し、コンパイル済み成果物を生成しない点は仕様。ビルドステップの欠如を問題として指摘しない。
- 自動テストは未導入。テストが無いこと自体をブロッキングな指摘にはしない。
- `canvas` / `sharp` は特定アーキテクチャ向けのネイティブバイナリを含む(`package.json` の `pnpm.supportedArchitectures` で制御)。プラットフォーム限定は意図的。
- `article-fetcher` が `.article-cache` にファイルキャッシュを書き出すのは意図的な挙動。

## コミット規約

Conventional Commits (`<type>(<scope>): <description>`)。`<description>` は日本語。
