import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'

export default class PopTeamEpic extends BaseService {
  private title: string | null = null
  private link: string | null = null
  private image: string | null = null

  information(): ServiceInformation {
    if (!this.title || !this.link || !this.image) {
      throw new Error('Service is not initialized')
    }
    return {
      title: this.title,
      link: this.link,
      description: `${this.title} / 大川ぶくぶ / まんがライフWIN`,

      image: {
        url: this.image,
        title: this.title,
        link: this.link,
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('PopTeamEpic::collect')

    const activeSeason = await this.fetchActiveSeason()
    if (!activeSeason) {
      logger.warn('❗ No active season found')
      return {
        status: false,
        items: [],
      }
    }

    logger.info(`👀 ${activeSeason.title} ${activeSeason.url}`)

    this.title = activeSeason.title
    this.link = activeSeason.url
    this.image = activeSeason.image

    const response = await axios.get(activeSeason.url, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    const $ = cheerio.load(response.data)

    const items: Item[] = []
    // 月ごとに取得
    for (const monthlyElement of $(
      'div.extMdlSeriesMngrBook > div.extMdlSeriesMngrBookInner > ul.bookul > li.bookli:not(.btnMoreLi)'
    )) {
      const monthlyName = $(monthlyElement).find('div.bTtl h3').text().trim()

      const itemElements = $(monthlyElement).find('div.bookR li a')
      for (const element of itemElements) {
        const anchor = $(element)
        const url = anchor.attr('href') ?? ''

        const item = await PopTeamEpicItem.of(url)
        if (!item) {
          continue
        }
        const title = item.itemTitle
        const images = item.itemImages

        logger.info(`📃 ${monthlyName} ${title} ${url}`)

        // saving images
        if (!fs.existsSync('output/popute/')) {
          fs.mkdirSync('output/popute/', { recursive: true })
        }
        const imageUrls = []
        for (const image of images) {
          const base64 = image.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64, 'base64')

          const trimmedBuffer = await sharp(buffer)
            .trim()
            .extend({
              top: 10,
              bottom: 10,
              left: 10,
              right: 10,
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .toBuffer()

          const hash = this.hash(trimmedBuffer)
          fs.writeFileSync(`output/popute/${hash}.jpg`, trimmedBuffer)
          imageUrls.push(
            `https://book000.github.io/rss-deliver/popute/${hash}.jpg`
          )
        }

        const itemTitle = `${monthlyName} ${title}`
        items.push({
          title: itemTitle,
          link: url,
          'content:encoded': imageUrls
            .map((index) => `<img src="${index}">`)
            .join('<br>'),
        })
      }
    }

    return {
      status: true,
      items,
    }
  }

  async fetchActiveSeason(): Promise<{
    title: string
    url: string
    image: string
  } | null> {
    const response = await axios.get(
      'https://mangalifewin.takeshobo.co.jp/rensai/',
      {
        validateStatus: () => true,
      }
    )

    const $ = cheerio.load(response.data)

    const seriesElement = $('ul[id*="extMdlSeriesMngrSeries"].line2 li')
    const series: {
      title: string
      url: string
      image: string
    }[] = seriesElement
      .map((_, e) => {
        const element = $(e)
        const title = element.find('p.itemSeriesTitle').text().trim()
        const url = element.find('p.itemSeriesTitle a').attr('href')
        const image = element.find('a.itemImage img').attr('src')
        return { title, url, image }
      })
      .get()

    const popute = series.find((s) => s.title.startsWith('ポプテピピック'))
    if (!popute) {
      return null
    }

    return popute
  }

  hash(buffer: Buffer): string {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('hex')
  }
}

class PopTeamEpicItem {
  readonly itemTitle: string
  readonly itemImages: string[]

  private constructor(title: string, images: string[]) {
    this.itemTitle = title
    this.itemImages = images
  }

  public static async of(url: string) {
    const logger = Logger.configure('PopTeamEpicItem::of')
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
    return new PopTeamEpicItem(title, images)
  }
}
