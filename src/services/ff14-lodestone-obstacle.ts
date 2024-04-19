import { BaseService } from '@/base-service'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import { Logger } from '@book000/node-utils'
import axios from 'axios'
import cheerio from 'cheerio'

export default class FF14LodestoneObstacle extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'FF14 Lodestone Obstacle',
      link: 'https://jp.finalfantasyxiv.com/lodestone/',
      description: 'Obstacle - FINAL FANTASY XIV, The Lodestone',

      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('FF14LodestoneObstacle::collect')
    const response = await axios.get<string>(
      'https://jp.finalfantasyxiv.com/lodestone/',
      {
        validateStatus: () => true,
      }
    )
    if (response.status !== 200 && response.data.includes('メンテナンス中')) {
      logger.info('🚧 FF14 Lodestone is under maintenance')
      return {
        status: false,
        items: [],
      }
    }
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }

    const $ = cheerio.load(response.data)
    const items: Item[] = []
    /*
      -: 最新
      1: トピックス
      2: お知らせ
      3: メンテナンス
      4: アップデート
      5: 障害情報
    */
    const obstacle = $(
      '#toptabchanger_newsarea > div.toptabchanger_newsbox:nth-child(5) li.news__list a'
    )
    for (const index of obstacle.slice(0, 10)) {
      const item = $(index)
      const title = item.find('p').text()
      const link = 'https://jp.finalfantasyxiv.com' + (item.attr('href') ?? '')

      const content = await this.getContent(link)
      const pubDate = content.pubDate
      const text = content.text

      items.push({
        title,
        link,
        'content:encoded': text,
        pubDate,
      })
    }

    return {
      status: true,
      items,
    }
  }

  private async getContent(
    url: string
  ): Promise<{ pubDate: string; text: string }> {
    const response = await axios.get(url, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch content: ${response.status}`)
    }
    const $ = cheerio.load(response.data)
    const text = $('div.news__detail__wrapper').html() ?? ''
    const timeScript =
      $('header.news__header > time[class^=news__ic] > script').html() ?? ''
    const pubDate = timeScript.match(/ldst_strftime\((\d+),.*?\)/)?.[1] ?? ''
    return {
      pubDate: new Date(Number(pubDate) * 1000).toUTCString(),
      text,
    }
  }
}
