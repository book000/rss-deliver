import { BaseService } from '@/BaseService'
import { Logger } from '@/logger'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import cheerio from 'cheerio'
import crypto from 'crypto'

export default class TdrUpdates extends BaseService {
  information(): ServiceInformation {
    return {
      title: '大切なお知らせ | 東京ディズニーリゾート',
      link: 'https://www.tokyodisneyresort.jp/tdr/update.html',
      description: '東京ディズニーリゾート「大切なお知らせ」をご案内します。',
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('TdrUpdates::collect')
    const response = await axios.get(
      'https://www.tokyodisneyresort.jp/tdr/update.html'
    )
    const $ = cheerio.load(response.data)
    const items: Item[] = []
    for (const element of $('div.listUpdate ul li a')) {
      const anchor = $(element)
      const url = anchor.attr('href') ?? ''
      const title = anchor.find('p.txt').text()
      const dateRaw = anchor.find('p.date').text() // 2023.7.24 更新情報
      const year = ('0000' + dateRaw.split('.')[0]).slice(-4)
      const month = ('00' + dateRaw.split('.')[1]).slice(-2)
      const day = ('00' + dateRaw.split('.')[2].split(' ')[0]).slice(-2)
      const date = new Date(`${year}-${month}-${day}T00:00:00+09:00`)

      logger.info(`📃 ${title} ${url} (${year}/${month}/${day}`)

      items.push({
        title,
        link: url,
        pubDate: date.toUTCString(),
      })
    }
    return {
      status: true,
      items,
    }
  }

  async hash(buffer: Buffer): Promise<string> {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('hex')
  }
}
