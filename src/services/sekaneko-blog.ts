import { BaseService } from '@/base-service'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import cheerio from 'cheerio'

export default class SekanekoBlog extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'せかねこさんの日々',
      link: 'https://sekaneko13.biz',
      description: 'せかねこさんの日々 | Powered by NAPBIZ',

      image: {
        url: 'https://sekaneko13.biz/wp-content/uploads/2018/03/cropped-sekaneko-prof-32x32.jpg',
        title: 'せかねこさんの日々',
        link: 'https://sekaneko13.biz',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const parser = new XMLParser({
      ignoreAttributes: false,
    })
    const response = await axios.get('https://sekaneko13.biz/feed/')
    const oldFeed = parser.parse(response.data)
    const items: Item[] = []
    for (const item of oldFeed.rss.channel.item) {
      const link: string = item.link

      items.push({
        title: item.title,
        link,
        'content:encoded': await this.getContent(link),
      })
    }
    return {
      status: true,
      items,
    }
  }

  async getContent(url: string): Promise<string> {
    const response = await axios.get(url)
    const $ = cheerio.load(response.data)
    return $('section.content').html() || ''
  }
}
