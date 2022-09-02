import { BaseService } from '@/BaseService'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
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
    const response = await axios.get(
      'https://jp.finalfantasyxiv.com/lodestone/'
    )

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
    for (const i of obstacle.slice(0, 10)) {
      const item = $(i)
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
    const response = await axios.get(url)
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
