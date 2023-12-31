import { BaseService } from '@/BaseService'
import { Logger } from '@/logger'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import cheerio from 'cheerio'
import crypto from 'crypto'
import fs from 'fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf'
import { createCanvas } from 'canvas'

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
      'https://www.tokyodisneyresort.jp/tdr/update.html',
      {
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
      }
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

      let content
      if (url.endsWith('.pdf')) {
        const pdfUrls = await this.pdf2png(url)
        content = pdfUrls.map((url) => `<img src="${url}">`).join('<br>')
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
    })
    const pdfData = new Uint8Array(response.data)
    const pdfDoc = await pdfjs.getDocument({ data: pdfData }).promise

    if (!fs.existsSync('output/tdr-updates/')) {
      fs.mkdirSync('output/tdr-updates/', { recursive: true })
    }
    const imageUrls = []
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 1.0 })
      const canvas = createCanvas(viewport.width, viewport.height)
      const ctx = canvas.getContext('2d')

      if (!ctx || !ctx.canvas) {
        continue
      }

      await page.render({ canvasContext: ctx as never, viewport }).promise

      const image = canvas.toBuffer('image/png')
      const hash = await this.hash(image)
      fs.writeFileSync(`output/tdr-updates/${hash}.png`, new Uint8Array(image))
      imageUrls.push(
        `https://book000.github.io/rss-deliver/tdr-updates/${hash}.png`
      )
    }
    return imageUrls
  }

  async hash(buffer: Buffer): Promise<string> {
    const hash = crypto.createHash('md5')
    hash.update(buffer)
    return hash.digest('hex')
  }
}
