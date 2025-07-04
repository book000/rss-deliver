/**
 * 削除記事の情報を表すインターフェース
 */
export interface DeletedArticle {
  /** 記事の識別子（guid?.['#text'] || link || title） */
  id: string
  /** 記事タイトル */
  title: string
  /** 記事URL */
  link: string
  /** 記事公開日時（ISO 8601形式） */
  pubDate: string
  /** 削除検出日時（ISO 8601形式） */
  deletedAt: string
  /** サービス名 */
  serviceName: string
}

/**
 * 削除記事履歴全体を表すインターフェース
 */
export interface DeletedArticlesHistory {
  /** スキーマバージョン */
  version: string
  /** 最終更新日時（ISO 8601形式） */
  lastUpdated: string
  /** 削除記事の配列 */
  articles: DeletedArticle[]
}
