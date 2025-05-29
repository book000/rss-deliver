import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { Logger } from '@book000/node-utils'
import { Item } from '@/model/collect-result'

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
    } catch (error) {
      logger.error('❌ Failed to parse previous feed', error as Error)
      return []
    }
  } catch (error) {
    logger.error('❌ Failed to fetch previous feed', error as Error)
    return []
  }
}

/**
 * 新しいアイテムと前回のアイテムを比較して、pubDateを引き継ぐ
 * @param newItem 新しいアイテム
 * @param previousItems 前回のアイテムリスト
 * @returns pubDateが設定されたアイテム
 */
export function inheritPubDate(newItem: Item, previousItems: RssItem[]): Item {
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

  // 前回のpubDateがある場合は引き継ぐ、ない場合は現在時刻を設定
  return {
    ...newItem,
    pubDate: previousItem?.pubDate,
  }
}
