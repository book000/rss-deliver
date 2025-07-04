import axios from 'axios'
import { Logger } from '@book000/node-utils'
import { Item } from '@/model/collect-result'
import { DeletedArticle, DeletedArticlesHistory } from '@/model/deleted-article'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

interface RssItem {
  title: string
  link: string
  description?: string
  'content:encoded'?: string
  author?: string
  category?: string
  comments?: string
  enclosure?: string
  guid?: {
    '@_isPermaLink'?: boolean
    '#text'?: string
  }
  pubDate?: string
  source?: string
}

// GitHub Pagesの履歴ファイルURL
const DELETED_ARTICLES_HISTORY_URL =
  'https://book000.github.io/rss-deliver/deleted-articles-history.json'

/**
 * 記事の一意識別子を取得（既存のルールに従う）
 */
function getItemId(item: RssItem | Item): string {
  return (item.guid?.['#text'] ?? item.link) || item.title
}

/**
 * GitHub Pagesから削除記事履歴を取得
 */
export async function fetchDeletedArticlesHistory(): Promise<DeletedArticlesHistory | null> {
  const logger = Logger.configure('utils.fetchDeletedArticlesHistory')

  try {
    // キャッシュバスターを追加
    const response = await axios.get<DeletedArticlesHistory>(
      `${DELETED_ARTICLES_HISTORY_URL}?t=${Date.now()}`,
      {
        validateStatus: () => true,
        timeout: 10_000,
      }
    )

    if (response.status !== 200) {
      logger.warn(
        `❌ Failed to fetch deleted articles history: ${response.status}`
      )
      return null
    }

    logger.info(
      `✅ Fetched deleted articles history with ${response.data.articles.length} articles`
    )
    return response.data
  } catch (error) {
    logger.error('❌ Failed to fetch deleted articles history', error as Error)
    return null
  }
}

/**
 * 削除記事を検出
 */
export function detectDeletedArticles(
  previousItems: RssItem[],
  currentItems: Item[],
  serviceName: string
): DeletedArticle[] {
  const logger = Logger.configure(`utils.detectDeletedArticles.${serviceName}`)

  // 現在のフィードの記事IDセットを作成
  const currentIds = new Set(currentItems.map((item) => getItemId(item)))

  // 前回のフィードにあって現在のフィードにない記事を削除記事として検出
  const deletedArticles = previousItems
    .filter((item) => !currentIds.has(getItemId(item)))
    .map((item) => ({
      id: getItemId(item),
      title: item.title,
      link: item.link,
      pubDate: item.pubDate ?? new Date().toISOString(),
      deletedAt: new Date().toISOString(),
      serviceName,
    }))

  if (deletedArticles.length > 0) {
    logger.info(`🗑️ Detected ${deletedArticles.length} deleted articles`)
    for (const article of deletedArticles) {
      logger.info(`[${serviceName}] Detected deleted article: ${article.title}`)
    }
  }

  return deletedArticles
}

/**
 * 削除記事履歴をクリーンアップ（30日以上古いものを削除）
 */
export function cleanupDeletedArticlesHistory(
  history: DeletedArticlesHistory
): DeletedArticlesHistory {
  const logger = Logger.configure('utils.cleanupDeletedArticlesHistory')
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const originalCount = history.articles.length
  const cleanedArticles = history.articles.filter((article) => {
    const deletedAt = new Date(article.deletedAt)
    return deletedAt >= thirtyDaysAgo
  })

  const removedCount = originalCount - cleanedArticles.length
  if (removedCount > 0) {
    logger.info(`🧹 Cleaned up ${removedCount} articles older than 30 days`)
  }

  return {
    ...history,
    articles: cleanedArticles,
  }
}

/**
 * 削除記事履歴を更新
 */
export function updateDeletedArticlesHistory(
  currentHistory: DeletedArticlesHistory | null,
  newDeletedArticles: DeletedArticle[]
): DeletedArticlesHistory {
  const logger = Logger.configure('utils.updateDeletedArticlesHistory')

  // 既存の履歴がない場合は新規作成
  if (!currentHistory) {
    logger.info('📄 Creating new deleted articles history')
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      articles: newDeletedArticles,
    }
  }

  // 既存の記事IDセットを作成
  const existingIds = new Set(
    currentHistory.articles.map((article) => article.id)
  )

  // 新しい削除記事のうち、まだ記録されていないものを追加
  const newArticles = newDeletedArticles.filter(
    (article) => !existingIds.has(article.id)
  )

  if (newArticles.length > 0) {
    logger.info(
      `📝 Adding ${newArticles.length} new deleted articles to history`
    )
  }

  const updatedHistory = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    articles: [...currentHistory.articles, ...newArticles],
  }

  // 30日以上古い記事をクリーンアップ
  return cleanupDeletedArticlesHistory(updatedHistory)
}

/**
 * 削除記事履歴をファイルに保存
 */
export function saveDeletedArticlesHistory(
  history: DeletedArticlesHistory
): void {
  const logger = Logger.configure('utils.saveDeletedArticlesHistory')

  try {
    const outputPath = path.join(
      process.cwd(),
      'output',
      'deleted-articles-history.json'
    )
    writeFileSync(outputPath, JSON.stringify(history, null, 2))
    logger.info(`💾 Saved deleted articles history to ${outputPath}`)
  } catch (error) {
    logger.error('❌ Failed to save deleted articles history', error as Error)
  }
}

/**
 * 削除記事履歴からpubDateを取得
 */
export function getPubDateFromDeletedHistory(
  itemId: string,
  history: DeletedArticlesHistory | null
): string | undefined {
  if (!history) {
    return undefined
  }

  const deletedArticle = history.articles.find(
    (article) => article.id === itemId
  )
  return deletedArticle?.pubDate
}
