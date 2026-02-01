import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'node:fs'
import crypto from 'node:crypto'
import sharp from 'sharp'

/**
 * ポプテピピック RSS サービス
 *
 * 竹コミ！からポプテピピックの漫画情報を収集し、RSS フィードを生成する
 */
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

    const items = await this.collectTakecomicItems(activeSeason.url)

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
    source: 'takecomic'
  } | null> {
    return this.fetchTakecomicSeason()
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

  /**
   * シリーズページからエピソードアイテムを収集する
   *
   * @param seriesUrl シリーズページの URL
   * @returns RSS アイテムの配列
   */
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
      // サムネイル画像がない場合はスキップ
      if (!episode.thumbnailUrl) {
        logger.warn(`❗ No thumbnail for ${episode.title}`)
        continue
      }

      const date = this.parseJstDate(episode.date)
      // シリーズページから取得したサムネイル画像を使用
      const imageUrls = await this.saveImages([episode.thumbnailUrl], logger)
      if (imageUrls.length === 0) {
        continue
      }

      const itemTitle = episode.date
        ? `${episode.date} ${episode.title}`
        : episode.title
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

  /**
   * シリーズページからエピソードリストを抽出する
   *
   * @param $ cheerio オブジェクト
   * @returns エピソード情報の配列（タイトル、URL、日付、サムネイル画像URL）
   */
  private extractTakecomicEpisodes($: cheerio.CheerioAPI): {
    title: string
    url: string
    date: string
    thumbnailUrl: string
  }[] {
    const episodes: {
      title: string
      url: string
      date: string
      thumbnailUrl: string
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
      // サムネイル画像URLを取得（-sm を -lg に変換）
      const thumbnailSrc = $(element).find('img').first().attr('src') ?? ''
      const thumbnailUrl = thumbnailSrc
        ? PopTeamEpic.normalizeUrl(
            thumbnailSrc.replace(/-sm\.(webp|png|jpe?g)$/i, '-lg.$1')
          )
        : ''
      episodes.push({ title, url, date, thumbnailUrl })
    }
    return episodes
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
