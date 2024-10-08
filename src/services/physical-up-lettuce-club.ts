import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import * as cheerio from 'cheerio'

export default class PhysicalUpLettuceClub extends BaseService {
  information(): ServiceInformation {
    return {
      title: '体力アップ1年生',
      link: 'https://www.lettuceclub.net/news/serial/11656/',
      description: '体力アップ1年生 | レタスクラブ',

      image: {
        url: 'https://www.lettuceclub.net/i/N1/matome/11656/1621994268.jpg',
        title: '体力アップ1年生',
        link: 'https://www.lettuceclub.net/news/serial/11656/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('PhysicalUpLettuceClub::collect')
    const response = await axios.get(
      'https://www.lettuceclub.net/news/serial/11656/',
      {
        validateStatus: () => true,
      }
    )
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    const $ = cheerio.load(response.data)
    const items: Item[] = []
    for (const index of $('div.l-contents ol.p-items__list li.p-items__item')) {
      const item = $(index)
      const title = item.find('p.c-item__title').text()
      let link =
        'https://www.lettuceclub.net' + (item.find('a').attr('href') ?? '')
      if (!link.includes('article')) {
        continue
      }
      if (link.endsWith('display/')) {
        link = link.replace('display/', '')
      }

      const content = await this.getContent(link)
      if (!content) {
        continue
      }
      const images = content.images
      const pubDate = content.pubDate

      logger.info(`📃 ${title} ${link}`)
      logger.info(`📅 ${pubDate}`)
      logger.info(`🎨 ${images.toString()}`)

      items.push({
        title,
        link,
        'content:encoded': images
          .map((index) => `<img src="${index}">`)
          .join('<br>'),
        pubDate,
      })
    }
    return {
      status: true,
      items,
    }
  }

  async getContent(url: string): Promise<{
    images: string[]
    pubDate: string
  } | null> {
    const response = await axios.get(url, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      return null
    }
    const $ = cheerio.load(response.data)

    const images: string[] = []
    for (const index of $('div.l-contents figure img')) {
      const url = $(index).attr('src') ?? ''
      if (!url.startsWith('https')) {
        continue
      }
      images.push(url)
    }
    const rawPubDate = $('main time.c-date').attr('datetime') ?? '' // 2021.04.28
    const pubDate = new Date(rawPubDate.replaceAll('.', '/')).toUTCString()
    return {
      // 1つ目はサムネイルなので除外
      images: images.slice(1),
      pubDate,
    }
  }
}
