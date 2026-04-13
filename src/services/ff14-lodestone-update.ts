import { BaseService } from '@/base-service'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import { fetchArticleWithCache } from '@/utils/article-fetcher'
import { Logger } from '@book000/node-utils'
import * as cheerio from 'cheerio'

export default class FF14LodestoneUpdate extends BaseService {
  /**
   * サービス情報を返す。
   * @returns サービスのタイトル・リンク・説明などのメタ情報
   */
  information(): ServiceInformation {
    return {
      title: 'FF14 Lodestone Update',
      link: 'https://jp.finalfantasyxiv.com/lodestone/',
      description: 'Update - FINAL FANTASY XIV, The Lodestone',

      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  /**
   * FF14 Lodestone のアップデート一覧を収集する。
   * 各記事ページのコンテンツはキャッシュ付きでフェッチして返す。
   * @returns 収集結果（アイテムリストとステータス）
   */
  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('FF14LodestoneUpdate::collect')
    const res = await fetch('https://jp.finalfantasyxiv.com/lodestone/')
    const data = await res.text()
    if (res.status !== 200 && data.includes('メンテナンス中')) {
      logger.info('🚧 FF14 Lodestone is under maintenance')
      return {
        status: false,
        items: [],
      }
    }
    if (res.status !== 200) {
      throw new Error(`Failed to fetch: ${res.status}`)
    }

    const $ = cheerio.load(data)
    const items: Item[] = []
    /*
      -: 最新
      1: トピックス
      2: お知らせ
      3: メンテナンス
      4: アップデート
      5: 障害情報
    */
    const update = $(
      '#toptabchanger_newsarea > div.toptabchanger_newsbox:nth-child(4) li.news__list a'
    )
    for (const index of update.slice(0, 10)) {
      const item = $(index)
      const title = item.find('p').text()
      const link = 'https://jp.finalfantasyxiv.com' + (item.attr('href') ?? '')

      let text: string
      try {
        text = await fetchArticleWithCache(link, this, logger, {
          contentSelector: 'div.news__detail__wrapper',
        })
      } catch (error) {
        logger.error(
          `❌ Failed to fetch article content: ${link}`,
          error as Error
        )
        text = `<p>${title}</p>`
      }

      items.push({
        title,
        link,
        'content:encoded': text,
      })
    }

    return {
      status: true,
      items,
    }
  }
}
