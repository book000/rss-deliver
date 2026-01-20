import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'

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
    const takecomicImages = PopTeamEpicItem.extractTakecomicImages(
      response.data
    )
    if (takecomicImages.length > 0) {
      const title = PopTeamEpicItem.extractTakecomicTitle($)
      return new PopTeamEpicItem(title, takecomicImages)
    }

    const item = $(`#extMdlSeriesMngrArticle78`)
    const title = item.find('h3').text().trim()
    const images: string[] = item
      .find('img')
      .map((_, e) => $(e).attr('src') ?? '')
      .get()
      .filter((src) => src !== '')
    if (!title && images.length === 0) {
      logger.warn('❗ Failed to parse item details')
      return null
    }
    return new PopTeamEpicItem(title, images)
  }

  private static extractTakecomicTitle($: cheerio.CheerioAPI): string {
    const title = $('h1.ep-main-h-h').first().text().trim()
    if (title) {
      return title
    }
    const ogTitle = $('meta[property="og:title"]').attr('content') ?? ''
    return ogTitle
      .replace(/\s*\|\s*竹コミ！\s*$/, '')
      .replace(/^ポプテピピック[・\s]*/, '')
      .trim()
  }

  private static extractTakecomicImages(html: string): string[] {
    const imageUrls: string[] = []
    const lgRegex =
      /(?:https?:)?\/\/cdn-public\.comici\.jp\/episode\/[^"'\s]+-lg\.(?:webp|png|jpe?g)/g
    for (const match of html.matchAll(lgRegex)) {
      const url = PopTeamEpicItem.normalizeUrl(match[0])
      if (!imageUrls.includes(url)) {
        imageUrls.push(url)
      }
    }

    if (imageUrls.length > 0) {
      return imageUrls
    }

    const smRegex =
      /(?:https?:)?\/\/cdn-public\.comici\.jp\/episode\/[^"'\s]+-sm\.(?:webp|png|jpe?g)/g
    for (const match of html.matchAll(smRegex)) {
      const url = PopTeamEpicItem.normalizeUrl(
        match[0].replace(/-sm\.(webp|png|jpe?g)$/i, '-lg.$1')
      )
      if (!imageUrls.includes(url)) {
        imageUrls.push(url)
      }
    }
    return imageUrls
  }

  private static normalizeUrl(url: string): string {
    if (url.startsWith('//')) {
      return `https:${url}`
    }
    return url
  }
}

export default class PopTeamEpic extends BaseService {
  private title: string | null = null
  private link: string | null = null
  private image: string | null = null
  private siteName: string | null = null

  information(): ServiceInformation {
    if (!this.title || !this.link || !this.image || !this.siteName) {
      throw new Error('Service is not initialized')
    }
    return {
      title: this.title,
      link: this.link,
      description: `${this.title} / 大川ぶくぶ / ${this.siteName}`,

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
    this.siteName = activeSeason.siteName

    const items =
      activeSeason.source === 'takecomic'
        ? await this.collectTakecomicItems(activeSeason.url)
        : await this.collectMangalifeItems(activeSeason.url)

    return {
      status: true,
      items,
    }
  }

  async fetchActiveSeason(): Promise<{
    title: string
    url: string
    image: string
    siteName: string
    source: 'takecomic' | 'mangalifewin'
  } | null> {
    const takecomicSeason = await this.fetchTakecomicSeason()
    if (takecomicSeason) {
      return takecomicSeason
    }

    return this.fetchMangalifeSeason()
  }

  private async fetchTakecomicSeason(): Promise<{
    title: string
    url: string
    image: string
    siteName: string
    source: 'takecomic'
  } | null> {
    const takecomicSeriesUrl = 'https://takecomic.jp/series/8f3616ce97c36'
    const response = await axios.get(takecomicSeriesUrl, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      return null
    }

    const $ = cheerio.load(response.data)
    const title = $('meta[property="og:title"]').attr('content')?.trim() ?? ''
    const image = PopTeamEpic.normalizeUrl(
      $('meta[property="og:image"]').attr('content') ?? ''
    )
    if (!title || !image) {
      return null
    }
    return {
      title,
      url: takecomicSeriesUrl,
      image,
      siteName: '竹コミ！',
      source: 'takecomic',
    }
  }

  private async fetchMangalifeSeason(): Promise<{
    title: string
    url: string
    image: string
    siteName: string
    source: 'mangalifewin'
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
        const url = element.find('p.itemSeriesTitle a').attr('href') ?? ''
        const image = element.find('a.itemImage img').attr('src') ?? ''
        return { title, url, image }
      })
      .get()

    const popute = series.find((s) => s.title.startsWith('ポプテピピック'))
    if (!popute) {
      return null
    }

    return {
      ...popute,
      siteName: 'まんがライフWIN',
      source: 'mangalifewin',
    }
  }

  private async collectTakecomicItems(seriesUrl: string): Promise<Item[]> {
    const logger = Logger.configure('PopTeamEpic::collectTakecomicItems')
    const response = await axios.get(seriesUrl, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    const $ = cheerio.load(response.data)

    const items: Item[] = []
    const episodes = this.extractTakecomicEpisodes($)
    for (const episode of episodes) {
      const item = await PopTeamEpicItem.of(episode.url)
      if (!item) {
        continue
      }
      const title = item.itemTitle || episode.title
      const date = this.parseJstDate(episode.date)
      const imageUrls = await this.saveImages(item.itemImages, logger)
      if (imageUrls.length === 0) {
        continue
      }

      const itemTitle = episode.date ? `${episode.date} ${title}` : title
      logger.info(`📃 ${itemTitle} ${episode.url}`)
      items.push({
        title: itemTitle,
        link: episode.url,
        'content:encoded': imageUrls
          .map((index) => `<img src="${index}">`)
          .join('<br>'),
        ...(date ? { pubDate: date.toUTCString() } : {}),
      })
    }
    return items
  }

  private extractTakecomicEpisodes($: cheerio.CheerioAPI): {
    title: string
    url: string
    date: string
  }[] {
    const episodes: {
      title: string
      url: string
      date: string
    }[] = []
    const seen = new Set<string>()

    for (const element of $('.series-eplist-item')) {
      const anchor = $(element).find('a.series-eplist-item-link').first()
      const href = anchor.attr('href') ?? ''
      if (!href) {
        continue
      }
      const url = PopTeamEpic.normalizeUrl(href)
      if (seen.has(url)) {
        continue
      }
      seen.add(url)
      const title = $(element).find('.series-eplist-item-h-text').text().trim()
      const date = $(element)
        .find('.series-eplist-item-meta-date')
        .text()
        .trim()
      episodes.push({ title, url, date })
    }
    return episodes
  }

  private async collectMangalifeItems(seriesUrl: string): Promise<Item[]> {
    const logger = Logger.configure('PopTeamEpic::collectMangalifeItems')
    const response = await axios.get(seriesUrl, {
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

        const imageUrls = await this.saveImages(images, logger)
        if (imageUrls.length === 0) {
          continue
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
    return items
  }

  private async saveImages(
    images: string[],
    logger: Logger
  ): Promise<string[]> {
    if (!fs.existsSync('output/popute/')) {
      fs.mkdirSync('output/popute/', { recursive: true })
    }

    const imageUrls: string[] = []
    for (const image of images) {
      const buffer = await this.fetchImageBuffer(image, logger)
      if (!buffer) {
        continue
      }

      const trimmedBuffer = await sharp(buffer)
        .trim()
        .extend({
          top: 10,
          bottom: 10,
          left: 10,
          right: 10,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 90 })
        .toBuffer()

      const hash = this.hash(trimmedBuffer)
      fs.writeFileSync(`output/popute/${hash}.jpg`, trimmedBuffer)
      imageUrls.push(`https://book000.github.io/rss-deliver/popute/${hash}.jpg`)
    }
    return imageUrls
  }

  private async fetchImageBuffer(
    image: string,
    logger: Logger
  ): Promise<Buffer | null> {
    if (image.startsWith('data:image/')) {
      const base64 = image.replace(/^data:image\/\w+;base64,/, '')
      return Buffer.from(base64, 'base64')
    }

    const imageUrl = PopTeamEpic.normalizeUrl(image)
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      logger.warn(
        `❗ Failed to download image (${response.status}) ${imageUrl}`
      )
      return null
    }
    return Buffer.from(response.data)
  }

  private parseJstDate(dateText: string): Date | null {
    if (!dateText) {
      return null
    }
    const [year, month, day] = dateText.split('/')
    if (!year || !month || !day) {
      return null
    }
    return new Date(`${year}-${month}-${day}T00:00:00+09:00`)
  }

  private static normalizeUrl(url: string): string {
    if (url.startsWith('//')) {
      return `https:${url}`
    }
    if (url.startsWith('/')) {
      return new URL(url, 'https://takecomic.jp').toString()
    }
    return url
  }

  hash(buffer: Buffer): string {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('hex')
  }
}
