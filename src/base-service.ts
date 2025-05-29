import CollectResult, { Item } from './model/collect-result'
import ServiceInformation from './model/service-information'
import { getPreviousFeed, inheritPubDate } from './utils/previous-feed'
import { Logger } from '@book000/node-utils'

export abstract class BaseService {
  abstract information(): ServiceInformation

  abstract collect(): Promise<CollectResult>

  /**
   * RSSアイテムのpubDateを処理する
   * pubDateが設定されていない場合、前回のフィードから引き継ぐか現在時刻を設定する
   * @param items 処理するアイテムリスト
   * @returns pubDateが設定されたアイテムリスト
   */
  async processPubDates(items: Item[]): Promise<Item[]> {
    const logger = Logger.configure(`${this.constructor.name}.processPubDates`)
    logger.info('🕒 Processing pubDates for items...')

    const countHasPubDate = items.filter((item) => item.pubDate).length

    // 前回のフィードを取得
    const previousItems = await getPreviousFeed(this.constructor.name)

    // 各アイテムのpubDateを処理
    const processedItems = items.map((item) =>
      inheritPubDate(item, previousItems)
    )

    const countInheritedPubDate =
      processedItems.filter((item) => item.pubDate && item.pubDate !== '')
        .length - countHasPubDate

    // pubDateが設定されていないアイテムには現在時刻を設定
    const now = new Date()
    const processedItemsWithNow = processedItems.map((item) => {
      if (!item.pubDate) {
        logger.warn(`No pubDate found for item: ${item.title}. Setting to now.`)
        return {
          ...item,
          pubDate: now.toUTCString(), // 現在時刻を設定
        }
      }
      return item
    })

    const countWithNow = processedItemsWithNow.filter(
      (item) => item.pubDate === now.toUTCString()
    ).length

    logger.info(
      `Processed ${items.length} items: ${countHasPubDate} with pubDate, ${countInheritedPubDate} inherited pubDate, ${countWithNow} set to now`
    )

    return processedItemsWithNow
  }
}
