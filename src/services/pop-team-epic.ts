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
 * contentsInfo API のページデータ
 */
interface PageContentInfo {
  /** 画像URL（署名付き） */
  imageUrl: string
  /** スクランブル配列（JSON文字列） */
  scramble: string
  /** ソート順 */
  sort: number
  /** 画像の幅 */
  width: number
  /** 画像の高さ */
  height: number
  /** 有効期限 */
  expiresOn: number
}

/**
 * contentsInfo API のレスポンス
 */
interface ContentsInfoResponse {
  /** 総ページ数 */
  totalPages: number
  /** スクロール方向 */
  scrollDirection: string
  /** 見開き指定 */
  spreadDesignation: number
  /** ページデータ（ページ順に格納された配列） */
  result: PageContentInfo[]
}

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
    const logger = Logger.configure('PopTeamEpic::fetchTakecomicSeason')
    const takecomicSeriesUrl = 'https://takecomic.jp/series/8f3616ce97c36'
    const response = await axios.get(takecomicSeriesUrl, {
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    })
    if (response.status !== 200) {
      logger.warn(
        `❗ Failed to fetch takecomic series page (status=${response.status})`
      )
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
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    const $ = cheerio.load(response.data)

    const items: Item[] = []
    const episodes = this.extractTakecomicEpisodes($)
    for (const episode of episodes) {
      const date = this.parseJstDate(episode.date)

      // エピソードページから全画像を取得
      const imageUrls = await this.fetchEpisodeImages(episode.url, logger)

      // 画像が取得できなかった場合はサムネイルにフォールバック
      if (imageUrls.length === 0 && episode.thumbnailUrl) {
        logger.warn(`⚠️ Falling back to thumbnail for ${episode.title}`)
        const thumbnailUrls = await this.saveImages(
          [episode.thumbnailUrl],
          logger
        )
        if (thumbnailUrls.length > 0) {
          imageUrls.push(...thumbnailUrls)
        }
      }

      if (imageUrls.length === 0) {
        logger.warn(`❗ No images for ${episode.title}`)
        continue
      }

      const itemTitle = episode.date
        ? `${episode.date} ${episode.title}`
        : episode.title
      logger.info(`📃 ${itemTitle} ${episode.url} (${imageUrls.length} images)`)
      items.push({
        title: itemTitle,
        link: episode.url,
        'content:encoded': imageUrls
          .map((url) => `<img src="${url}">`)
          .join('<br>'),
        ...(date ? { pubDate: date.toUTCString() } : {}),
      })
    }
    return items
  }

  /**
   * エピソードページから全画像を取得する
   *
   * @param episodeUrl エピソードページの URL
   * @param logger ロガー
   * @returns 画像 URL の配列
   */
  private async fetchEpisodeImages(
    episodeUrl: string,
    logger: Logger
  ): Promise<string[]> {
    try {
      // エピソードページを取得
      const response = await axios.get(episodeUrl, {
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
      })
      if (response.status !== 200) {
        logger.warn(`❗ Failed to fetch episode page (${response.status})`)
        return []
      }

      // viewerId を抽出
      const viewerId = this.extractViewerId(response.data)
      if (!viewerId) {
        logger.warn('❗ viewerId not found in episode page')
        return []
      }

      // contentsInfo API を呼び出し
      const contentsInfo = await this.fetchContentsInfo(viewerId, episodeUrl)
      if (!contentsInfo || contentsInfo.totalPages === 0) {
        logger.warn('❗ No pages found in contentsInfo')
        return []
      }

      logger.info(`📖 Found ${contentsInfo.totalPages} pages`)

      // 各ページの画像を取得・復元
      const imageUrls: string[] = []
      for (let i = 0; i < contentsInfo.totalPages; i++) {
        const pageData = contentsInfo.result[i]
        if (!pageData) {
          continue
        }

        const imageUrl = await this.fetchAndUnscrambleImage(
          pageData,
          episodeUrl,
          logger
        )
        if (imageUrl) {
          imageUrls.push(imageUrl)
        }
      }

      return imageUrls
    } catch (error) {
      logger.warn(`❗ Failed to fetch episode images: ${String(error)}`)
      return []
    }
  }

  /**
   * HTML から viewerId を抽出する
   *
   * @param html HTML 文字列
   * @returns viewerId または null
   */
  private extractViewerId(html: string): string | null {
    // data-comici-viewer-id 属性から viewerId を探す
    const dataAttrRegex = /data-comici-viewer-id="([a-f0-9]{32})"/i
    const dataAttrMatch = dataAttrRegex.exec(html)
    if (dataAttrMatch?.[1]) {
      return dataAttrMatch[1]
    }

    // __next_f (React Server Components) から viewerId を探す（フォールバック）
    const jsonRegex = /"viewerId":"([a-f0-9]{32})"/i
    const jsonMatch = jsonRegex.exec(html)
    return jsonMatch?.[1] ?? null
  }

  /**
   * contentsInfo API を呼び出す
   *
   * API は page-to が実際のページ数を超えると 400 エラーを返すため、
   * まず page-to=1 で totalPages を取得し、その後全ページを取得する
   *
   * @param viewerId ビューアー ID
   * @param episodeUrl エピソード URL（Referer ヘッダーに使用）
   * @returns API レスポンス
   */
  private async fetchContentsInfo(
    viewerId: string,
    episodeUrl: string
  ): Promise<ContentsInfoResponse | null> {
    const logger = Logger.configure('PopTeamEpic::fetchContentsInfo')

    const headers = {
      Origin: 'https://takecomic.jp',
      Referer: episodeUrl,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    }

    // ステップ1: page-to=1 で totalPages を取得
    const initialParams = new URLSearchParams({
      'user-id': '',
      'comici-viewer-id': viewerId,
      'page-from': '0',
      'page-to': '1',
    })
    const initialUrl = `https://takecomic.jp/api/book/contentsInfo?${initialParams.toString()}`

    logger.info(`📡 Fetching totalPages: viewerId=${viewerId}`)

    const initialResponse = await axios.get<ContentsInfoResponse>(initialUrl, {
      validateStatus: () => true,
      headers,
    })

    if (initialResponse.status !== 200) {
      logger.warn(
        `❌ API error (initial): status=${initialResponse.status}, viewerId=${viewerId}`
      )
      return null
    }

    const totalPages = initialResponse.data.totalPages
    logger.info(`📖 totalPages=${totalPages}`)

    if (totalPages <= 1) {
      // 1 ページのみの場合は初回レスポンスをそのまま返す
      return initialResponse.data
    }

    // ステップ2: 全ページを取得
    const fullParams = new URLSearchParams({
      'user-id': '',
      'comici-viewer-id': viewerId,
      'page-from': '0',
      'page-to': String(totalPages),
    })
    const fullUrl = `https://takecomic.jp/api/book/contentsInfo?${fullParams.toString()}`

    const fullResponse = await axios.get<ContentsInfoResponse>(fullUrl, {
      validateStatus: () => true,
      headers,
    })

    if (fullResponse.status !== 200) {
      logger.warn(
        `❌ API error (full): status=${fullResponse.status}, viewerId=${viewerId}`
      )
      return null
    }

    logger.info(`✅ Fetched ${totalPages} pages successfully`)

    return fullResponse.data
  }

  /**
   * スクランブルされた画像を取得し、復元して保存する
   *
   * @param pageData ページデータ
   * @param episodeUrl エピソード URL（Referer ヘッダーに使用）
   * @param logger ロガー
   * @returns 保存した画像の URL
   */
  private async fetchAndUnscrambleImage(
    pageData: PageContentInfo,
    episodeUrl: string,
    logger: Logger
  ): Promise<string | null> {
    try {
      // 画像をダウンロード（CloudFront 署名付き URL には適切なヘッダーが必要）
      const response = await axios.get(pageData.imageUrl, {
        responseType: 'arraybuffer',
        validateStatus: () => true,
        headers: {
          Referer: episodeUrl,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept:
            'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      })

      if (response.status !== 200) {
        logger.warn(`❗ Failed to download image (${response.status})`)
        return null
      }

      const scrambledBuffer = Buffer.from(response.data)

      // スクランブル配列をパース
      let scramble: number[]
      try {
        scramble = JSON.parse(pageData.scramble)
      } catch {
        logger.warn('❗ Invalid scramble JSON, using original image')
        return await this.saveUnscrambledImage(scrambledBuffer)
      }

      // 画像を復元
      const unscrambledBuffer = await this.unscrambleImage(
        scrambledBuffer,
        scramble
      )

      // 画像を保存
      return await this.saveUnscrambledImage(unscrambledBuffer)
    } catch (error) {
      logger.warn(`❗ Failed to unscramble image: ${String(error)}`)
      return null
    }
  }

  /**
   * スクランブルされた画像を復元する
   *
   * @param buffer スクランブルされた画像バッファ
   * @param scramble スクランブル配列
   * @returns 復元された画像バッファ
   */
  private async unscrambleImage(
    buffer: Buffer,
    scramble: number[]
  ): Promise<Buffer> {
    // グリッドサイズを計算（通常は 4x4 = 16 タイル）
    const gridSize = Math.sqrt(scramble.length)
    if (!Number.isInteger(gridSize)) {
      // スクランブルなしとして元の画像を返す
      return buffer
    }

    // 元画像をロード
    const image = sharp(buffer)
    const metadata = await image.metadata()

    // メタデータが取得できない場合は元の画像を返す
    if (!metadata.width || !metadata.height) {
      return buffer
    }

    // 実際の画像サイズを使用
    const actualTileWidth = Math.floor(metadata.width / gridSize)
    const actualTileHeight = Math.floor(metadata.height / gridSize)

    // 各タイルを抽出（clone() を使用して再デコードを避ける）
    // Column-Major 順序で抽出する: (0,0), (0,1), (0,2), (0,3), (1,0)...
    const tiles: Buffer[] = []
    for (let c = 0; c < gridSize; c++) {
      for (let r = 0; r < gridSize; r++) {
        const left = c * actualTileWidth
        const top = r * actualTileHeight

        const tile = await image
          .clone()
          .extract({
            left,
            top,
            width: actualTileWidth,
            height: actualTileHeight,
          })
          .toBuffer()

        tiles.push(tile)
      }
    }

    // スクランブル配列に従ってタイルを再配置
    // scramble[i] = srcIndex
    // 出力も Column-Major 順序で配置する
    const compositeOperations: sharp.OverlayOptions[] = []
    let f = 0
    for (let c = 0; c < gridSize; c++) {
      for (let r = 0; r < gridSize; r++) {
        const srcIndex = scramble[f]

        if (srcIndex >= 0 && srcIndex < tiles.length) {
          compositeOperations.push({
            input: tiles[srcIndex],
            left: c * actualTileWidth,
            top: r * actualTileHeight,
          })
        }
        f++
      }
    }

    // 復元画像を作成
    const unscrambled = await sharp({
      create: {
        width: actualTileWidth * gridSize,
        height: actualTileHeight * gridSize,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(compositeOperations)
      .jpeg({ quality: 90 })
      .toBuffer()

    return unscrambled
  }

  /**
   * 復元した画像を保存する
   *
   * @param buffer 画像バッファ
   * @returns 保存した画像の URL
   */
  private async saveUnscrambledImage(buffer: Buffer): Promise<string> {
    if (!fs.existsSync('output/popute/')) {
      fs.mkdirSync('output/popute/', { recursive: true })
    }

    // トリミングとパディングを追加
    const processedBuffer = await sharp(buffer)
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

    const hash = this.hash(processedBuffer)
    fs.writeFileSync(`output/popute/${hash}.jpg`, processedBuffer)
    return `https://book000.github.io/rss-deliver/popute/${hash}.jpg`
  }

  /**
   * シリーズページからエピソードリストを抽出する
   *
   * @param $ cheerio オブジェクト
   * @returns エピソード情報の配列（タイトル、URL、日付、サムネイル画像URL）
   */
  private extractTakecomicEpisodes($: ReturnType<typeof cheerio.load>): {
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
