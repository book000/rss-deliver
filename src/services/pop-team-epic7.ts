import { BaseService } from '@/BaseService'
import { Logger } from '@/logger'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import cheerio from 'cheerio'
import fs from 'fs'
import crypto from 'crypto'

export default class PopTeamEpic7 extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'ポプテピピック シーズン７',
      link: 'https://mangalifewin.takeshobo.co.jp/rensai/popute7/',
      description: 'ポプテピピック シーズン７ / 大川ぶくぶ / まんがライフWIN',

      image: {
        url: 'https://mangalifewin.takeshobo.co.jp/global-image/manga/okawabukubu/popute7/popute7-001/article_t.jpg',
        title: 'ポプテピピック シーズン７',
        link: 'https://mangalifewin.takeshobo.co.jp/rensai/popute7/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('PopTeamEpic7::collect')
    const response = await axios.get(
      'https://mangalifewin.takeshobo.co.jp/rensai/popute7/'
    )
    const $ = cheerio.load(response.data)
    const items: Item[] = []
    let i = 0
    for (const element of $('div.bookR li a')) {
      i++
      const anchor = $(element)
      const url = anchor.attr('href') ?? ''

      const item = await PopTeamEpic7Item.of(url)
      if (!item) {
        continue
      }
      const title = item.itemTitle
      const images = item.itemImages

      logger.info(`📃 ${title} ${url}`)

      // saving images
      if (!fs.existsSync('output/popute7/')) {
        fs.mkdirSync('output/popute7/', { recursive: true })
      }
      const imageUrls = []
      for (const v in images) {
        const image = images[v]
        const base64 = image.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        const hash = await this.hash(buffer)
        fs.writeFileSync(`output/popute7/${hash}.jpg`, buffer)
        imageUrls.push(
          `https://book000.github.io/rss-deliver/popute7/${hash}.jpg`
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

class PopTeamEpic7Item {
  readonly itemTitle: string
  readonly itemImages: string[]

  private constructor(title: string, images: string[]) {
    this.itemTitle = title
    this.itemImages = images
  }

  public static async of(url: string) {
    const logger = Logger.configure('PopTeamEpic7Item::of')
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
    return new PopTeamEpic7Item(title, images)
  }
}
