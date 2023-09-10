import { BaseService } from '@/BaseService'
import { Logger } from '@/logger'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import cheerio from 'cheerio'
import fs from 'fs'
import crypto from 'crypto'

export default class PopTeamEpic8 extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'ポプテピピック シーズン８',
      link: 'https://mangalifewin.takeshobo.co.jp/rensai/hosiirore/',
      description: 'ポプテピピック シーズン８ / 大川ぶくぶ / まんがライフWIN',

      image: {
        url: 'https://mangalifewin.takeshobo.co.jp/global-image/manga/okawabukubu/hosiirore/series_t.jpg',
        title: 'ポプテピピック シーズン８',
        link: 'https://mangalifewin.takeshobo.co.jp/rensai/hosiirore/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('PopTeamEpic8::collect')
    const response = await axios.get(
      'https://mangalifewin.takeshobo.co.jp/rensai/hosiirore/'
    )
    const $ = cheerio.load(response.data)
    const items: Item[] = []
    for (const element of $('div.bookR li a')) {
      const anchor = $(element)
      const url = anchor.attr('href') ?? ''

      const item = await PopTeamEpic8Item.of(url)
      if (!item) {
        continue
      }
      const title = item.itemTitle
      const images = item.itemImages

      logger.info(`📃 ${title} ${url}`)

      // saving images
      if (!fs.existsSync('output/popute8/')) {
        fs.mkdirSync('output/popute8/', { recursive: true })
      }
      const imageUrls = []
      for (const v in images) {
        const image = images[v]
        const base64 = image.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        const hash = await this.hash(buffer)
        fs.writeFileSync(`output/popute8/${hash}.jpg`, buffer)
        imageUrls.push(
          `https://book000.github.io/rss-deliver/popute8/${hash}.jpg`
        )
      }

      items.push({
        title,
        link: url,
        'content:encoded': imageUrls
          .map((i) => `<img src="${i}">`)
          .join('<br>'),
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

class PopTeamEpic8Item {
  readonly itemTitle: string
  readonly itemImages: string[]

  private constructor(title: string, images: string[]) {
    this.itemTitle = title
    this.itemImages = images
  }

  public static async of(url: string) {
    const logger = Logger.configure('PopTeamEpic8Item::of')
    logger.info(`📃 ${url}`)
    const response = await axios.get<string>(url, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      logger.warn(`❗ Failed to get item details (${response.status})`)
      return null
    }
    const $ = cheerio.load(response.data)
    const item = $(`#extMdlSeriesMngrArticle78`)

    const title = item.find('h3').text()
    const images: string[] = item
      .find('img')
      .map((_, e) => $(e).attr('src'))
      .get()
    return new PopTeamEpic8Item(title, images)
  }
}
