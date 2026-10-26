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
 * 前回フィードの取得結果
 */
export interface PreviousFeedResult {
  /**
   * ok: 取得できた / not-found: 404（未公開） / error: 通信エラー・想定外の応答・パース失敗
   */
  status: 'ok' | 'not-found' | 'error'
  /** 前回のアイテム（ok 以外は空配列） */
  items: RssItem[]
}

/**
 * 前回フィードの XML からアイテムを取り出す。
 * `<item>` は `<channel>` の中にあるが、`<channel>` の外（`<rss>` 直下）に出力していた旧形式も読む。
 * @param xml 前回フィードの XML
 * @returns 前回のアイテム
 * @throws RSS として解釈できない場合
 */
export function parsePreviousFeed(xml: string): RssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
  })
  const parsed: {
    rss?: {
      channel?: {
        item?: RssItem | RssItem[]
      }
      item?: RssItem | RssItem[]
    }
  } = parser.parse(xml)
  if (parsed.rss === undefined) {
    throw new Error('Previous feed is not an RSS document')
  }
  const items = parsed.rss.channel?.item ?? parsed.rss.item ?? []

  // 配列でない場合（アイテムが1つだけの場合）は配列に変換
  return Array.isArray(items) ? items : [items]
}

/**
 * GitHub Pagesから公開されているRSSフィードを取得し、取得の成否を区別して返す
 * @param serviceName サービス名
 * @returns 取得結果
 */
export async function loadPreviousFeed(
  serviceName: string
): Promise<PreviousFeedResult> {
  const logger = Logger.configure('utils.getPreviousFeed')

  // キャッシュがあれば、それを使用
  if (
    feedCache[serviceName] !== undefined &&
    Date.now() - feedCache[serviceName].lastFetched.getTime() < 3_600_000 // 1時間以内
  ) {
    logger.info(`🔄 Using cached feed for ${serviceName}`)
    return { status: 'ok', items: feedCache[serviceName].items }
  }

  try {
    // GitHub Pagesから最新のフィードを取得
    const feedUrl = `https://book000.github.io/rss-deliver/${serviceName}.xml`
    logger.info(`📥 Fetching previous feed from ${feedUrl}`)

    const res = await fetch(feedUrl, {
      signal: AbortSignal.timeout(10_000),
    })

    if (res.status === 404) {
      logger.warn(`❌ Previous feed not found: ${feedUrl}`)
      return { status: 'not-found', items: [] }
    }
    if (res.status !== 200) {
      logger.warn(`❌ Failed to fetch previous feed: ${res.status}`)
      return { status: 'error', items: [] }
    }

    try {
      const itemsArray = parsePreviousFeed(await res.text())

      // キャッシュに保存
      feedCache[serviceName] = {
        lastFetched: new Date(),
        items: itemsArray,
      }

      logger.info(`✅ Found ${itemsArray.length} previous items`)
      return { status: 'ok', items: itemsArray }
    } catch (error) {
      logger.error('❌ Failed to parse previous feed', error as Error)
      return { status: 'error', items: [] }
    }
  } catch (error) {
    logger.error('❌ Failed to fetch previous feed', error as Error)
    return { status: 'error', items: [] }
  }
}

/**
 * GitHub Pagesから公開されているRSSフィードを取得する
 * @param serviceName サービス名
 * @returns 前回のRSSフィードのアイテム、または取得失敗時は空配列
 */
export async function getPreviousFeed(serviceName: string): Promise<RssItem[]> {
  const result = await loadPreviousFeed(serviceName)
  return result.items
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
  // すでにpubDateがある場合はそのまま返す
  if (newItem.pubDate) {
    return newItem
  }

  const logger = Logger.configure(
    `utils.inheritPubDate${serviceName ? `.${serviceName}` : ''}`
  )

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
