import { BaseService } from '@/base-service'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import { loadPreviousFeed } from '@/utils/previous-feed'
import { findNewShowEvidence } from '@/utils/show-classifier'
import { Logger } from '@book000/node-utils'
import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'

const ONE_DAY_MS = 86_400_000

/**
 * 今回の取得結果から新着として載せる記事の、公開日からの上限日数。
 * オリエンタルランドの一覧のように過去の記事をすべて返す取得元があるため、毎回適用する。
 */
const NEW_ARTICLE_DAYS = 7

/** 前回アイテムを引き継ぐ公開日からの上限日数 */
const RETENTION_DAYS = 90

/** 概要の最大文字数 */
const SUMMARY_MAX_LENGTH = 300

/** Akamai 配下のサイトが curl 風のクライアントを弾くため、ブラウザ風のヘッダーを付ける */
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
}

/**
 * 公式ニュースの 1 記事を、判定前の共通形式で表す。
 */
export interface Candidate {
  /** 地域・パーク名 */
  region: string
  /** 公式記事の原文タイトル */
  title: string
  /** 公式記事の URL */
  link: string
  /** 公開日時（取得できない・解釈できない場合は undefined） */
  pubDate: Date | undefined
  /** 概要のプレーンテキスト（無い場合は空文字） */
  summary: string
  /** 本文のプレーンテキスト（無い場合は空文字） */
  bodyText: string
}

/**
 * 公式ニュースの取得元を表す。
 */
export interface SourceFetcher {
  /** ログに出す取得元の名前 */
  name: string
  /** 記事の候補を取得する。失敗した場合は例外を投げる */
  fetch: () => Promise<Candidate[]>
}

/**
 * WordPress 標準の RSS の `item` のうち、使う要素（値は XML のパース結果で型が定まらない）
 */
interface WordPressItem {
  title?: unknown
  link?: unknown
  pubDate?: unknown
  description?: unknown
  'content:encoded'?: unknown
  category?: unknown[]
}

/**
 * WordPress 標準の RSS のパース結果のうち、使う部分
 */
interface WordPressFeed {
  rss?: {
    channel?: {
      item?: WordPressItem[]
    }
  }
}

/**
 * HTML 文字列からタグを除去し、空白を詰めたプレーンテキストを返す。
 * @param html HTML 文字列
 * @returns プレーンテキスト
 */
function toPlainText(html: unknown): string {
  return typeof html !== 'string' || html === ''
    ? ''
    : cheerio.load(html).text().replaceAll(/\s+/g, ' ').trim()
}

/**
 * XML のパース結果（文字列または数値）を、前後の空白を除いた文字列にする。
 * @param value パース結果
 * @returns 文字列。文字列でも数値でもない場合は空文字
 */
function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
}

/**
 * 文字列を最大文字数で切る。サロゲートペアの途中で切れた場合は 1 文字戻す。
 * @param text 文字列
 * @param maxLength 最大文字数
 * @returns 切った文字列
 */
function truncate(text: string, maxLength: number): string {
  const cut = text.slice(0, maxLength)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

/**
 * 日付文字列を Date に変換する。
 * @param value 日付文字列
 * @returns 解釈できた場合は Date、できない場合は undefined
 */
function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Disney Parks Blog のカテゴリ一覧から地域名を決める。
 * 対象リゾートのカテゴリを持たない記事（クルーズ等）は undefined を返す。
 * @param categories 記事のカテゴリ一覧
 * @returns 地域名。複数のリゾートにまたがる場合は `, ` で連結する
 */
export function resolveDpbRegion(categories: string[]): string | undefined {
  const regions: string[] = []
  if (
    categories.some((category) => category.includes('Walt Disney World Resort'))
  ) {
    regions.push('Walt Disney World Resort (Florida)')
  }
  if (categories.some((category) => category.includes('Disneyland Resort'))) {
    regions.push('Disneyland Resort (California)')
  }
  return regions.length > 0 ? regions.join(', ') : undefined
}

/**
 * WordPress 標準の RSS 2.0 を候補の配列に変換する。
 * @param xml RSS の XML 文字列
 * @param region 地域名。関数の場合はカテゴリ一覧から地域名を決め、undefined を返した記事は含めない
 * @returns 候補の配列
 */
export function parseWordPressFeed(
  xml: string,
  region: string | ((categories: string[]) => string | undefined)
): Candidate[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    htmlEntities: true,
    isArray: (name) => name === 'item' || name === 'category',
  })
  const feed = parser.parse(xml) as WordPressFeed
  const candidates: Candidate[] = []
  const items = feed.rss?.channel?.item ?? []
  for (const item of items) {
    const categories = (item.category ?? []).map((category) => toText(category))
    const regionName = typeof region === 'string' ? region : region(categories)
    if (regionName === undefined) {
      continue
    }
    candidates.push({
      region: regionName,
      title: toText(item.title),
      link: toText(item.link),
      pubDate: toDate(item.pubDate),
      summary: toPlainText(item.description),
      bodyText: toPlainText(item['content:encoded']),
    })
  }
  return candidates
}

/**
 * オリエンタルランドのニュースリリース一覧（HTML）を候補の配列に変換する。
 * 一覧には概要・本文が無いため、タイトルのみを使う。
 * @param html 一覧ページの HTML 文字列
 * @param baseUrl 相対 URL を解決する基準の URL
 * @returns 候補の配列
 */
export function parseOlcHtml(html: string, baseUrl: string): Candidate[] {
  const $ = cheerio.load(html)
  const candidates: Candidate[] = []
  for (const element of $('li[entrydate]')) {
    const entry = $(element)
    const href = entry.find('a').first().attr('href') ?? ''
    let link = href
    try {
      link = new URL(href, baseUrl).href
    } catch {
      // 解決できない URL はそのまま残し、後段の検証で捨てる
    }
    const date = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(
      entry.attr('entrydate') ?? ''
    )
    candidates.push({
      region: 'Tokyo Disney Resort',
      title: entry.find('.news_tx').first().text().trim(),
      link,
      pubDate: date
        ? toDate(`${date[1]}-${date[2]}-${date[3]}T00:00:00+09:00`)
        : undefined,
      summary: '',
      bodyText: '',
    })
  }
  return candidates
}

/**
 * 記事の識別に使う URL を正規化する（クエリ・ハッシュ・末尾スラッシュを除く）。
 * 比較にのみ使い、出力する URL には使わない。
 * @param link 記事の URL
 * @returns 正規化した URL。URL として解釈できない場合はそのまま返す
 */
function normalizeLink(link: string): string {
  try {
    const url = new URL(link)
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return link
  }
}

/**
 * アイテムの識別子を返す。guid、link、title の順に、最初に得られた値を使う。
 * @param item アイテム
 * @returns 正規化した識別子
 */
function getItemKey(item: Item): string {
  return normalizeLink((item.guid?.['#text'] ?? item.link) || item.title)
}

/**
 * 公開日からの経過時間が N 日以内かを返す。解釈できない公開日は false を返す。
 * @param item アイテム
 * @param now 現在時刻
 * @param days 日数
 * @returns `now - pubDate <= days × 24 時間` の場合は true
 */
function isWithinDays(item: Item, now: Date, days: number): boolean {
  const published = Date.parse(item.pubDate ?? '')
  return now.getTime() - published <= days * ONE_DAY_MS
}

/**
 * 今回のアイテムと前回のアイテムをマージする。
 *
 * 公開日が 7 日より古い今回のアイテムは、初回かどうかによらず載せない（過去記事の一斉配信を避ける）。
 * 今回の結果に無い前回のアイテムは、公開日が 90 日以内なら引き継ぐ。
 * 同じ識別子は今回の内容で上書きし、公開日の降順（同一時刻は link の昇順）に並べる。
 * @param current 今回のアイテム
 * @param previous 前回のアイテム
 * @param now 現在時刻
 * @returns マージ・整列後のアイテム
 */
export function mergeItems(
  current: Item[],
  previous: Item[],
  now: Date
): Item[] {
  const merged = new Map<string, Item>()
  for (const item of previous) {
    if (isWithinDays(item, now, RETENTION_DAYS)) {
      merged.set(getItemKey(item), item)
    }
  }
  for (const item of current) {
    if (isWithinDays(item, now, NEW_ARTICLE_DAYS)) {
      merged.set(getItemKey(item), item)
    }
  }
  return merged
    .values()
    .toArray()
    .toSorted((a, b) => {
      const diff = Date.parse(b.pubDate ?? '') - Date.parse(a.pubDate ?? '')
      if (diff !== 0) {
        return diff
      }
      return a.link < b.link ? -1 : a.link > b.link ? 1 : 0
    })
}

/**
 * 公式ニュースの取得元を作る。
 * @returns 5 つの取得元（DPB・パリ・香港・上海・東京）
 */
function createSources(): SourceFetcher[] {
  const fetchText = async (url: string, timeoutMs: number): Promise<string> => {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status !== 200) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`)
    }
    return res.text()
  }
  const olcUrl = 'https://www.olc.co.jp/ja/news.html'
  return [
    {
      name: 'Disney Parks Blog',
      fetch: async () =>
        parseWordPressFeed(
          await fetchText(
            'https://disneyparks.disney.go.com/blog/feed/',
            30_000
          ),
          resolveDpbRegion
        ),
    },
    {
      name: 'Disneyland Paris News',
      fetch: async () =>
        parseWordPressFeed(
          await fetchText('https://news.disneylandparis.com/feed/', 30_000),
          'Disneyland Paris'
        ),
    },
    {
      name: 'Hong Kong Disneyland Resort Press Room',
      fetch: async () =>
        parseWordPressFeed(
          await fetchText(
            'https://news.hongkongdisneyland.com/en/feed/',
            30_000
          ),
          'Hong Kong Disneyland Resort'
        ),
    },
    {
      name: 'Shanghai Disney Resort Corporate Site',
      fetch: async () =>
        parseWordPressFeed(
          await fetchText(
            'https://shcorporate.shanghaidisneyresort.com/en/feed/',
            60_000
          ),
          'Shanghai Disney Resort'
        ),
    },
    {
      name: 'Oriental Land News Release',
      fetch: async () => parseOlcHtml(await fetchText(olcUrl, 30_000), olcUrl),
    },
  ]
}

/**
 * http / https の URL かを返す。
 * @param link URL 文字列
 * @returns http / https の URL の場合は true
 */
function isHttpUrl(link: string): boolean {
  try {
    const { protocol } = new URL(link)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 世界のディズニーパークの公式ニュースから、新作のショー・パレード等の記事を集める。
 */
export default class DisneyParksNewShows extends BaseService {
  /**
   * サービス情報を返す。
   * @returns サービスのタイトル・リンク・説明などのメタ情報
   */
  information(): ServiceInformation {
    return {
      title: 'Disney Parks New Shows & Parades',
      link: 'https://github.com/book000/rss-deliver',
      description:
        'New shows and parades announced in official news of Disney parks worldwide',
      generator: 'book000/rss-deliver',
      language: 'en',
    }
  }

  /**
   * 公式ニュースを収集し、前回のフィードとマージして返す。
   * @returns 収集結果（アイテムリストとステータス）
   */
  async collect(): Promise<CollectResult> {
    const logger = Logger.configure(`${this.constructor.name}.collect`)
    const previous = await loadPreviousFeed(this.constructor.name)
    if (previous.status === 'error') {
      // 前回の記事を引き継げないまま公開すると、窓から外れた記事が失われるため、今回は更新しない
      logger.warn('❌ Failed to load the previous feed. Skipping this run')
      return { status: false, items: [] }
    }
    return this.collectFrom(createSources(), previous.items, new Date())
  }

  /**
   * 取得元ごとに公式ニュースを取得し、新作のショー・パレード等の記事を前回のアイテムとマージして返す。
   * 取得に失敗した（例外、または 0 件）取得元は他の取得元に影響させず、すべて失敗した場合のみ status を false にする。
   * @param sources 取得元
   * @param previousItems 前回のアイテム
   * @param now 現在時刻
   * @returns 収集結果（アイテムリストとステータス）
   */
  async collectFrom(
    sources: SourceFetcher[],
    previousItems: Item[],
    now: Date
  ): Promise<CollectResult> {
    const logger = Logger.configure(`${this.constructor.name}.collectFrom`)

    const results = await Promise.allSettled(
      sources.map((source) => source.fetch())
    )
    const candidates: Candidate[] = []
    let succeeded = 0
    for (const [index, result] of results.entries()) {
      const name = sources[index].name
      if (result.status === 'rejected') {
        logger.warn(
          `❌ Failed to collect ${name}`,
          result.reason instanceof Error ? result.reason : undefined
        )
        continue
      }
      if (result.value.length === 0) {
        logger.warn(`❌ No articles extracted from ${name}`)
        continue
      }
      logger.info(`📥 ${name}: ${result.value.length} articles`)
      succeeded++
      candidates.push(...result.value)
    }
    if (succeeded === 0) {
      logger.warn('❌ All sources failed')
      return { status: false, items: [] }
    }

    const grouped = new Map<
      string,
      { candidate: Candidate; regions: string[] }
    >()
    for (const candidate of candidates) {
      if (candidate.pubDate === undefined || !isHttpUrl(candidate.link)) {
        logger.warn(
          `⚠️ Dropped an article without a valid date or url: ${candidate.title}`
        )
        continue
      }
      const evidence = findNewShowEvidence(candidate)
      if (evidence === undefined) {
        continue
      }
      logger.info(
        `🎭 Matched ${JSON.stringify(candidate.title)} (${JSON.stringify(evidence)})`
      )
      const key = normalizeLink(candidate.link)
      const existing = grouped.get(key)
      if (existing) {
        if (!existing.regions.includes(candidate.region)) {
          existing.regions.push(candidate.region)
        }
        continue
      }
      grouped.set(key, { candidate, regions: [candidate.region] })
    }

    const currentItems: Item[] = grouped
      .values()
      .map(({ candidate, regions }) => {
        const label = regions.join(', ')
        const summary = truncate(candidate.summary, SUMMARY_MAX_LENGTH)
        return {
          title: candidate.title,
          link: candidate.link,
          description: `[${label}] ${summary}`.trim(),
          category: label,
          guid: { '#text': candidate.link },
          pubDate: candidate.pubDate?.toUTCString(),
        }
      })
      .toArray()

    const unparsable = previousItems.filter((item) =>
      Number.isNaN(Date.parse(item.pubDate ?? ''))
    )
    if (unparsable.length > 0) {
      logger.warn(
        `⚠️ ${unparsable.length} previous items have an invalid pubDate and are not carried over`
      )
    }
    const items = mergeItems(currentItems, previousItems, now)
    logger.info(
      `✅ ${currentItems.length} matched articles, ${items.length} items after merging with ${previousItems.length} previous items`
    )
    return { status: true, items }
  }
}
