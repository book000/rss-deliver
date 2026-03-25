import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import { fetchArticleWithCache } from '@/utils/article-fetcher'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'node:crypto'
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from 'canvas'

export default class TdrUpdates extends BaseService {
  private readonly pageUrl =
    'https://www.tokyodisneyresort.jp/tdr/news/update.html'

  /** 記事キャッシュを保存するディレクトリ */
  private readonly articleCacheDir = '.article-cache/tdr-updates'

  /**
   * サービス情報を返す。
   * @returns サービスのタイトル・リンク・説明などのメタ情報
   */
  information(): ServiceInformation {
    return {
      title: 'サイト更新情報 | 東京ディズニーリゾート',
      link: this.pageUrl,
      description: '東京ディズニーリゾート「サイト更新情報」をご案内します。',
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  /**
   * 東京ディズニーリゾートのサイト更新情報を収集する。
   * 各記事ページのコンテンツはキャッシュ付きでフェッチし、PDF の場合は画像化して返す。
   * @returns 収集結果（アイテムリストとステータス）
   */
  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('TdrUpdates::collect')
    const response = await axios.get(this.pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        DNT: '1',
      },
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch: ${response.status}`)
    }
    const $ = cheerio.load(response.data)
    const items: Item[] = []
    for (const element of $('div.listUpdate ul li a')) {
      const anchor = $(element)
      const href = anchor.attr('href') ?? ''
      const url = new URL(href, this.pageUrl).toString()
      const title = anchor.find('p.txt').text()
      const dateRaw = anchor.find('p.date').text() // 2023.7.24 更新情報
      const year = ('0000' + dateRaw.split('.')[0]).slice(-4)
      const month = ('00' + dateRaw.split('.')[1]).slice(-2)
      const day = ('00' + dateRaw.split('.')[2].split(' ')[0]).slice(-2)
      const date = new Date(`${year}-${month}-${day}T00:00:00+09:00`)

      logger.info(`📃 ${title} ${url} (${year}/${month}/${day})`)

      // カテゴリタグ（span.iconTag）を取得する
      const category = anchor.find('span.iconTag').text().trim()

      let content: string
      if (url.endsWith('.pdf')) {
        // PDF の場合は各ページを画像化してコンテンツとして設定する
        const pdfUrls = await this.pdf2png(url)
        content = pdfUrls.map((pdfUrl) => `<img src="${pdfUrl}">`).join('<br>')
      } else {
        // HTML ページの場合は記事ページをフェッチしてコンテンツとして設定する
        try {
          content = await fetchArticleWithCache(
            url,
            this.articleCacheDir,
            logger
          )
        } catch (error) {
          // フェッチに失敗した場合はリストページの説明文をフォールバックとして使用する
          logger.error(
            `Failed to fetch article, using fallback: ${url}`,
            error as Error
          )
          content = `<p><strong>${category}</strong></p><p>${title}</p>`
        }
      }

      items.push({
        title,
        link: url,
        pubDate: date.toUTCString(),
        'content:encoded': content,
      })
    }
    return {
      status: true,
      items,
    }
  }

  async pdf2png(url: string): Promise<string[]> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      throw new Error(`Failed to fetch pdf: ${response.status}`)
    }
    const pdfData = new Uint8Array(response.data)
    const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise

    if (!fs.existsSync('output/tdr-updates/')) {
      fs.mkdirSync('output/tdr-updates/', { recursive: true })
    }
    const imageUrls = []
    for (let index = 1; index <= pdfDocument.numPages; index++) {
      const page = await pdfDocument.getPage(index)
      const viewport = page.getViewport({ scale: 1 })
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')

      await page.render({
        canvasContext: context as never,
        viewport,
        canvas,
      } as never).promise

      const image = canvas.toBuffer('image/png')
      const hash = this.hash(image)
      fs.writeFileSync(`output/tdr-updates/${hash}.png`, new Uint8Array(image))
      imageUrls.push(
        `https://book000.github.io/rss-deliver/tdr-updates/${hash}.png`
      )
    }
    return imageUrls
  }

  hash(buffer: Buffer): string {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('hex')
  }
}
