import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { Logger } from '@book000/node-utils'
import { Item } from '@/model/collect-result'
import { DeletedArticlesHistory } from '@/model/deleted-article'
import { getPubDateFromDeletedHistory } from './deleted-articles-tracker'

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

type PreviousFeedCache = Record<
  string,
  | {
      lastFetched: Date
      items: RssItem[]
    }
  | undefined
>

// キャッシュを保持して、同じセッション内での重複取得を避ける
const feedCache: PreviousFeedCache = {}

/**
 * GitHub Pagesから公開されているRSSフィードを取得する
 * @param serviceName サービス名
 * @returns 前回のRSSフィードのアイテム、または取得失敗時は空配列
 */
export async function getPreviousFeed(serviceName: string): Promise<RssItem[]> {
  const logger = Logger.configure('utils.getPreviousFeed')

  // キャッシュがあれば、それを使用
  if (
    feedCache[serviceName] !== undefined &&
    Date.now() - feedCache[serviceName].lastFetched.getTime() < 3_600_000 // 1時間以内
  ) {
    logger.info(`🔄 Using cached feed for ${serviceName}`)
    return feedCache[serviceName].items
  }

  try {
    // GitHub Pagesから最新のフィードを取得
    const feedUrl = `https://book000.github.io/rss-deliver/${serviceName}.xml`
    logger.info(`📥 Fetching previous feed from ${feedUrl}`)

    const response = await axios.get<string>(feedUrl, {
      validateStatus: () => true,
      timeout: 10_000,
    })

    if (response.status !== 200) {
      logger.warn(`❌ Failed to fetch previous feed: ${response.status}`)
      return []
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
    })

    try {
      const parsed: {
        rss?: {
          channel?: {
            item?: RssItem | RssItem[]
          }
        }
      } = parser.parse(response.data)
      const items = parsed.rss?.channel?.item ?? []

      // 配列でない場合（アイテムが1つだけの場合）は配列に変換
      const itemsArray = Array.isArray(items) ? items : [items]

      // キャッシュに保存
      feedCache[serviceName] = {
        lastFetched: new Date(),
        items: itemsArray,
      }

      logger.info(`✅ Found ${itemsArray.length} previous items`)
      return itemsArray
    } catch (err) {
      logger.error('❌ Failed to parse previous feed', err as Error)
      return []
    }
  } catch (err) {
    logger.error('❌ Failed to fetch previous feed', err as Error)
    return []
  }
}

/**
 * 新しいアイテムと前回のアイテムを比較して、pubDateを引き継ぐ
 * 削除記事履歴からもpubDateを復元する
 * @param newItem 新しいアイテム
 * @param previousItems 前回のアイテムリスト
 * @param deletedHistory 削除記事履歴（オプション）
 * @param serviceName サービス名（ログ用）
 * @returns pubDateが設定されたアイテム
 */
export function inheritPubDate(
  newItem: Item,
  previousItems: RssItem[],
  deletedHistory?: DeletedArticlesHistory | null,
  serviceName?: string
): Item {
  const logger = Logger.configure(
    `utils.inheritPubDate${serviceName ? `.${serviceName}` : ''}`
  )

  // すでにpubDateがある場合はそのまま返す
  if (newItem.pubDate) {
    return newItem
  }

  // IDとして使える値を決定（優先順位: guid > link > title）
  const itemId = (newItem.guid?.['#text'] ?? newItem.link) || newItem.title

  // 前回のアイテムから一致するものを検索
  const previousItem = previousItems.find((item) => {
    const prevId = (item.guid?.['#text'] ?? item.link) || item.title
    return prevId === itemId
  })

  // 前回のpubDateがある場合は引き継ぐ
  if (previousItem?.pubDate) {
    return {
      ...newItem,
      pubDate: previousItem.pubDate,
    }
  }

  // 削除記事履歴からpubDateを復元
  if (deletedHistory) {
    const deletedPubDate = getPubDateFromDeletedHistory(itemId, deletedHistory)
    if (deletedPubDate) {
      if (serviceName) {
        logger.info(
          `[${serviceName}] Restored pubDate from deletion history: ${newItem.title}`
        )
      }
      return {
        ...newItem,
        pubDate: deletedPubDate,
      }
    }
  }

  // どちらにもない場合は undefined のまま返す
  return newItem
}
