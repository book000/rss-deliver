import { BaseService } from '@/base-service'
import CollectResult from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'

interface Item {
  id: number
  name: string
  title: string
  url: string
  domain: string
  tags: string
  good_count: number
  hit_count: number
}

interface DailyCount {
  title?: string
  count: number
}

interface Daily {
  count: DailyCount[]
  items: Item[]
}

interface Data {
  daily_qiita: Daily
  daily_zenn: Daily
  daily_hatena: Daily
  daily_team: Daily
  daily_individual: Daily
  daily_news: Daily
  daily_security: Daily
  weekly_qiita: Daily
  weekly_zenn: Daily
  weekly_hatena: Daily
  weekly_hit: Daily
  weekly_github: Daily
  monthly_qiita: Daily
  monthly_zenn: Daily
  monthly_hatena: Daily
  monthly_hit: Daily
  monthly_github: Daily
}

interface Dev1andFeedResponse {
  last_updated_at: string
  data: Data
}

export default class Dev1and extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'Devland',
      link: 'https://dev1and.com/',
      description: '最新技術ブログまとめ | Devland',
      image: {
        url: 'https://dev1and.com/icon.png',
        title: 'Devland',
        link: 'https://dev1and.com/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const response = await axios.get<Dev1andFeedResponse>(
      'https://feed.dev1and.com/api/v1/dashboard',
      {
        validateStatus: () => true,
      }
    )
    if (response.status !== 200) {
      return {
        status: false,
        items: [],
      }
    }

    const lastUpdatedAtRaw = response.data.last_updated_at
    const lastUpdatedAt = new Date(lastUpdatedAtRaw.replaceAll('/', '-'))
    const lastUpdatedDateText = this.getYearMonthWeek(lastUpdatedAt)
    const lastUpdatedDate = lastUpdatedDateText
      .replaceAll('/', '-')
      .replaceAll('#', '-')
      .replaceAll(' ', '-')

    const weeklyArticle = response.data.data.weekly_hit.items.map((item) => {
      return [
        '<li>',
        '<a href="' + item.url + '">' + item.title + '</a>',
        ' [' +
          item.good_count.toString() +
          ', ' +
          item.hit_count.toString() +
          ']',
        '</li>',
      ].join('')
    })

    const hatenaBookmarks = response.data.data.weekly_hatena.items.map(
      (item) => {
        return [
          '<li>',
          '<a href="' + item.url + '">' + item.title + '</a>',
          ' [' +
            item.good_count.toString() +
            ', ' +
            item.hit_count.toString() +
            ']',
          '</li>',
        ].join('')
      }
    )

    return {
      status: true,
      items: [
        {
          title: `週間ブログ・記事・はてなブックマーク (${lastUpdatedDateText})`,
          link: `https://dev1and.com/?${lastUpdatedDate}`,
          'content:encoded': [
            '<p>Last updated: ' + lastUpdatedAtRaw + '</p>',
            '<h2>週間ブログ・記事</h2>',
            '<ul>',
            weeklyArticle.join('\n'),
            '</ul>',

            '<h2>週間はてなブックマーク</h2>',
            '<ul>',
            hatenaBookmarks.join('\n'),
            '</ul>',
          ].join('\n'),
          pubDate: lastUpdatedAt.toUTCString(),
          guid: {
            '@_isPermaLink': false,
            '#text': lastUpdatedDate,
          },
        },
      ],
    }
  }

  getYearMonthWeek(date: Date): string {
    // yyyy-mm (week)
    const year = date.getFullYear()
    const month = ('00' + (date.getMonth() + 1).toString()).slice(-2)
    const week = Math.floor((date.getDate() - 1) / 7) + 1
    return `${year}/${month} #${week}`
  }
}
