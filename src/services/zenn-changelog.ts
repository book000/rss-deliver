import { BaseService } from '@/BaseService'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'

export default class ZennChangelog extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'Zenn Changelog',
      link: 'https://info.zenn.dev',
      description: "What's new on zenn.dev",

      image: {
        url: 'https://zenn.dev/images/logo-only-dark.png',
        title: 'Zenn Changelog',
        link: 'https://info.zenn.dev',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const parser = new XMLParser({
      ignoreAttributes: false,
    })
    const response = await axios.get('https://info.zenn.dev/rss/feed.xml')
    const oldFeed = parser.parse(response.data)
    const items: Item[] = []
    for (const item of oldFeed.rss.channel.item.slice(0, 10)) {
      // 直近の10件を取得
      const link: string = item.link

      const itemId = link.split('/').pop()
      const changelog =
        itemId !== undefined ? await ZennChangelogItem.of(itemId) : null

      const contents = []
      if (changelog && changelog.itemText) {
        contents.push(changelog.itemText)
      }
      if (changelog && changelog.itemUrl) {
        contents.push(
          '\n\n<a href="' +
            changelog.itemUrl +
            '">' +
            changelog.itemUrl +
            '</a>'
        )
      }

      items.push({
        title: item.title,
        link,
        'content:encoded': contents.map((s) => s && s?.trim()).join('\n\n'),
      })
    }
    return {
      status: true,
      items,
    }
  }
}

class ZennChangelogItem {
  readonly itemId: string

  readonly itemText: string | null
  readonly itemUrl: string | null
  static cacheInfo: string | null = null

  private constructor(
    itemId: string,
    itemText: string | null,
    itemUrl: string | null
  ) {
    this.itemId = itemId
    this.itemText = itemText
    this.itemUrl = itemUrl
  }

  public static async of(itemId: string) {
    console.log('ZennChangelogItem.of', itemId)
    const itemUrl = `https://info.zenn.dev/${itemId}`
    const response = await axios.get<string>(itemUrl, {
      validateStatus: () => true,
    })
    if (response.status !== 200) {
      console.warn('Failed to get changelog (' + response.status + ')')
      return null
    }
    const $ = cheerio.load(response.data)
    const item = $(`#${itemId}`)

    // Get item text
    const itemTextElement = item.find('[class^="SlugPage_blogBody"]')
    const itemText = itemTextElement ? itemTextElement.html() : null

    return new ZennChangelogItem(itemId, itemText, itemUrl)
  }
}
