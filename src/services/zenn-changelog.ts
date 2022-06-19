import { BaseService } from '@/BaseService'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import cheerio from 'cheerio'

export default class ZennChangelog extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'Zenn Changelog',
      link: 'https://zenn.dev/changelog/',
      description: "What's new on zenn.dev",

      image: {
        url: 'https://zenn.dev/images/logo-only-dark.png',
        title: 'Zenn Changelog',
        link: 'https://zenn.dev/changelog/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const parser = new XMLParser({
      ignoreAttributes: false,
    })
    const response = await axios.get('https://zenn.dev/changelog/feed/')
    const oldFeed = parser.parse(response.data)
    const items: Item[] = []
    for (const item of oldFeed.rss.channel.item) {
      const link: string = item.link

      const itemId = new URL(link).hash.substring(1)
      const changelog = await ZennChangelogItem.of(itemId)

      const contents = []
      if (changelog.itemText) {
        contents.push(changelog.itemText)
      }
      if (changelog.itemUrl) {
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
  readonly html: string

  readonly itemText: string | null
  readonly itemUrl: string | null

  private constructor(
    itemId: string,
    html: string,
    itemText: string | null,
    itemUrl: string | null
  ) {
    this.itemId = itemId
    this.html = html
    this.itemText = itemText
    this.itemUrl = itemUrl
  }

  public static async of(itemId: string) {
    const response = await axios.get('https://zenn.dev/changelog')
    if (response.status !== 200) {
      throw new Error('Failed to get changelog (' + response.status + ')')
    }
    const html = response.data
    const $ = cheerio.load(html)
    const item = $(`#${itemId}`)

    // Get item text
    const itemTextElement = item.find('[class^="ChangelogItem_itemDetailHtml"]')
    const itemText =
      itemTextElement && itemTextElement.text() !== ''
        ? itemTextElement.text()
        : null

    // Get item details url
    const itemUrlElement = item.find('[class^="ChangelogItem_itemDetailUrl"] a')
    const itemUrl = itemUrlElement ? itemUrlElement.attr('href') ?? null : null

    return new ZennChangelogItem(itemId, html, itemText, itemUrl)
  }
}
