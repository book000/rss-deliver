import { Logger } from '@book000/node-utils'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'node:crypto'
import fs from 'node:fs'

/** デフォルトで除去するセレクタのリスト */
const DEFAULT_REMOVE_SELECTORS = [
  'header',
  'footer',
  '#headerArea',
  '#footerArea',
  '.breadcrumbs',
  '.leftNavigation-block',
  '.leftNavigation-bottom',
  '.leftNavigationInner',
  '.favoriteArea',
  '.anchorLink',
  '.local-footer',
  'script',
  'style',
  'noscript',
]

/** デフォルトのメインコンテンツセレクタ */
const DEFAULT_CONTENT_SELECTOR = '#mainArea'

/** デフォルトの HTTP リクエストヘッダー */
const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br',
}

/** キャッシュデータの型定義 */
interface ArticleCacheData {
  /** 記事の URL */
  url: string
  /** 抽出したコンテンツ HTML */
  content: string
  /** フェッチ日時 (ISO 8601) */
  fetchedAt: string
}

/**
 * 記事ページの HTML からメインコンテンツを抽出する。
 * ヘッダー・フッター・ナビゲーション等を除去してメインエリアの HTML を返す。
 * @param html ページの HTML 文字列
 * @param contentSelector メインコンテンツのセレクタ (デフォルト: '#mainArea')
 * @param removeSelectors 除去するセレクタのリスト (デフォルト: 標準的なノイズ要素)
 * @returns 抽出したコンテンツ HTML
 */
export function extractArticleContent(
  html: string,
  contentSelector: string = DEFAULT_CONTENT_SELECTOR,
  removeSelectors: string[] = DEFAULT_REMOVE_SELECTORS
): string {
  const $ = cheerio.load(html)

  // ナビゲーション・ヘッダー・フッターなどのノイズ要素を除去する
  for (const selector of removeSelectors) {
    $(selector).remove()
  }

  // メインコンテンツを返す
  const mainArea = $(contentSelector)
  return mainArea.length > 0
    ? (mainArea.html() ?? '')
    : ($('body').html() ?? '')
}

/**
 * 記事ページのコンテンツをキャッシュ付きでフェッチする。
 * キャッシュが存在する場合はキャッシュから返し、なければフェッチしてキャッシュに保存する。
 * @param url 記事ページの URL
 * @param cacheDir キャッシュを保存するディレクトリ
 * @param logger ロガー
 * @param options オプション
 * @param options.headers HTTP リクエストヘッダー (デフォルト: 標準ブラウザヘッダー)
 * @param options.contentSelector メインコンテンツのセレクタ (デフォルト: '#mainArea')
 * @param options.removeSelectors 除去するセレクタのリスト (デフォルト: 標準的なノイズ要素)
 * @returns 記事ページのメインコンテンツ HTML
 */
export async function fetchArticleWithCache(
  url: string,
  cacheDir: string,
  logger: Logger,
  options: {
    headers?: Record<string, string>
    contentSelector?: string
    removeSelectors?: string[]
  } = {}
): Promise<string> {
  const urlHash = crypto.createHash('sha256').update(url).digest('hex')
  const cachePath = `${cacheDir}/${urlHash}.json`

  // キャッシュが存在する場合はキャッシュから返す
  if (fs.existsSync(cachePath)) {
    logger.info(`📦 記事キャッシュを使用: ${url}`)
    const cached = JSON.parse(
      fs.readFileSync(cachePath, 'utf8')
    ) as ArticleCacheData
    return cached.content
  }

  // 記事ページをフェッチする
  logger.info(`🌐 記事ページをフェッチ: ${url}`)
  const response = await axios.get(url, {
    headers: options.headers ?? DEFAULT_HEADERS,
    validateStatus: () => true,
  })
  if (response.status !== 200) {
    throw new Error(`Failed to fetch article: ${response.status} ${url}`)
  }

  const content = extractArticleContent(
    response.data as string,
    options.contentSelector,
    options.removeSelectors
  )

  // キャッシュディレクトリを作成してキャッシュに保存する
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  const cacheData: ArticleCacheData = {
    url,
    content,
    fetchedAt: new Date().toISOString(),
  }
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2))

  return content
}
