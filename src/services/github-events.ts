import { BaseService } from '@/base-service'
import { Logger } from '@book000/node-utils'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import * as cheerio from 'cheerio'
import ical, { VEvent, ParameterValue } from 'node-ical'

/** ICS ファイルの URL */
const ICS_URL =
  'https://calendar.google.com/calendar/ical/c_3d2f8eb9fd2c835a0d1c214386c9312d681ae2ddf456d2843bd7f0a73c770767%40group.calendar.google.com/public/basic.ics'

/** GitHub イベントページの URL */
const EVENTS_PAGE_URL = 'https://resources.github.com/ja/events/'

/**
 * ParameterValue から文字列値を取得する
 * @param value ParameterValue（文字列またはパラメータ付きオブジェクト）
 * @returns 文字列値。値がない場合は undefined
 */
function getParameterValue(
  value: ParameterValue | undefined
): string | undefined {
  if (typeof value === 'string') return value
  return value?.val
}

/**
 * ICS の DESCRIPTION（HTML）からイベントの URL を抽出する
 * @param description HTML 形式の説明文
 * @returns 抽出した URL。見つからない場合は undefined
 */
function extractEventUrl(description: string): string | undefined {
  const $ = cheerio.load(description)
  const links = $('a[href]')
  for (const element of links) {
    const href = $(element).attr('href')
    if (href?.startsWith('http')) {
      return href
    }
  }
  return undefined
}

/**
 * GitHub イベント（ウェビナーなど）を Google Calendar の ICS から RSS として配信するサービス
 */
export default class GitHubEvents extends BaseService {
  /**
   * サービス情報を返す
   * @returns サービス情報
   */
  information(): ServiceInformation {
    return {
      title: 'GitHub イベント',
      link: EVENTS_PAGE_URL,
      description:
        'GitHub またはパートナーが主催・共催・協賛するイベント、およびコミュニティー主催の GitHub に関連するイベントの情報',
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  /**
   * ICS ファイルから RSS アイテムを収集する
   * @returns 収集結果
   */
  async collect(): Promise<CollectResult> {
    const logger = Logger.configure('GitHubEvents.collect')

    try {
      // ICS ファイルを取得
      const response = await axios.get<string>(ICS_URL, {
        validateStatus: () => true,
      })
      if (response.status !== 200) {
        logger.error(`❌ Failed to fetch ICS: ${response.status}`)
        return {
          status: false,
          items: [],
        }
      }

      // ICS をパース
      const calendar = ical.sync.parseICS(response.data)

      // VEVENT のみ抽出
      const events = Object.values(calendar).filter(
        (component): component is VEvent => component?.type === 'VEVENT'
      )

      logger.info(`📅 Found ${events.length} events`)

      // イベントを開始日時の降順に並び替え（最新順）
      const sortedEvents = events.toSorted((a, b) => {
        const aTime = a.start instanceof Date ? a.start.getTime() : 0
        const bTime = b.start instanceof Date ? b.start.getTime() : 0
        return bTime - aTime
      })

      const items: Item[] = []
      for (const event of sortedEvents) {
        const title = getParameterValue(event.summary) ?? '(タイトルなし)'
        const descriptionRaw = getParameterValue(event.description)

        // イベントの詳細 URL を取得（description から抽出、なければイベントページ URL）
        const eventUrl =
          event.url ??
          (descriptionRaw ? extractEventUrl(descriptionRaw) : undefined) ??
          EVENTS_PAGE_URL

        // pubDate はイベント開始日時
        const pubDate =
          event.start instanceof Date ? event.start.toUTCString() : undefined

        // content:encoded に詳細情報を組み立てる
        const contentParts: string[] = []

        // 開始・終了日時
        if (event.start instanceof Date) {
          const startStr = event.start.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          contentParts.push(`<p>開始: ${startStr}</p>`)
        }
        if (event.end instanceof Date) {
          const endStr = event.end.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          contentParts.push(`<p>終了: ${endStr}</p>`)
        }

        // 場所
        const location = getParameterValue(event.location)
        if (location) {
          contentParts.push(`<p>場所: ${location}</p>`)
        }

        // 説明
        if (descriptionRaw) {
          contentParts.push(`<hr />${descriptionRaw}`)
        }

        // イベントページへのリンク
        contentParts.push(
          `<p><a href="${EVENTS_PAGE_URL}">GitHub イベント一覧ページ</a></p>`
        )

        logger.info(`📌 ${title} [${pubDate ?? 'no date'}]`)

        items.push({
          title,
          link: eventUrl,
          'content:encoded': contentParts.join('\n'),
          pubDate,
          guid: {
            '@_isPermaLink': false,
            '#text': event.uid,
          },
        })
      }

      return {
        status: true,
        items,
      }
    } catch (err) {
      logger.error('❌ Failed to collect GitHub events', err as Error)
      return {
        status: false,
        items: [],
      }
    }
  }
}
