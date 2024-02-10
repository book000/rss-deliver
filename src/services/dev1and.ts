import { BaseService } from '@/base-service'
import CollectResult from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'

export default class Development1and extends BaseService {
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
    const response = await axios.get(
      'https://feed.dev1and.com/api/v1/dashboard'
    )
    const lastUpdatedAtRaw = response.data.last_updated_at
    const lastUpdatedAt = new Date(lastUpdatedAtRaw.replaceAll('/', '-'))
    const lastUpdatedDateText = this.getYearMonthWeek(lastUpdatedAt)
    const lastUpdatedDate = lastUpdatedDateText
      .replaceAll('/', '-')
      .replaceAll('#', '-')
      .replaceAll(' ', '-')

    const weeklyArticle = response.data.data.weekly_hit.items.map(
      (item: {
        url: string
        title: string
        good_count: string
        hit_count: string
      }) => {
        return [
          '<li>',
          '<a href="' + item.url + '">' + item.title + '</a>',
          ' [' + item.good_count + ', ' + item.hit_count + ']',
          '</li>',
        ].join('')
      }
    )

    const hatenaBookmarks = response.data.data.weekly_hatena.items.map(
      (item: {
        url: string
        title: string
        good_count: string
        hit_count: string
      }) => {
        return [
          '<li>',
          '<a href="' + item.url + '">' + item.title + '</a>',
          ' [' + item.good_count + ', ' + item.hit_count + ']',
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
    const month = ('00' + (date.getMonth() + 1)).slice(-2)
    const week = Math.floor((date.getDate() - 1) / 7) + 1
    return `${year}/${month} #${week}`
  }
}
