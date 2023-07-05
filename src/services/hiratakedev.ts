import { BaseService } from '@/BaseService'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import axios from 'axios'
import matter from 'gray-matter'
import { marked } from 'marked'

export interface Links {
  self: string
  git: string
  html: string
}

export interface Content {
  name: string
  path: string
  sha: string
  size: number
  url: string
  html_url: string
  git_url: string
  download_url: string
  type: string
  _links: Links
}

type GitHubContentsResponse = Content[]

export default class HiratakeWeb extends BaseService {
  information(): ServiceInformation {
    return {
      title: 'Hiratake Web',
      link: 'https://hiratake.dev/blog/',
      description: 'ひらたけの個人ウェブサイトです。',
      image: {
        url: 'https://hiratake.dev/apple-touch-icon.png',
        title: 'Hiratake Web',
        link: 'https://hiratake.dev/blog/',
      },
      generator: 'book000/rss-deliver',
      language: 'ja',
    }
  }

  async collect(): Promise<CollectResult> {
    const response = await axios.get<GitHubContentsResponse>(
      'https://api.github.com/repos/Hiratake/hiratake-web/contents/content/blog'
    )

    const items: Item[] = []
    for (const content of response.data) {
      if (content.type !== 'file' || content.name === 'index.md') {
        continue
      }

      const url = `https://hiratake.dev/blog/${content.name.replace(
        '.md',
        ''
      )}/`
      const parser = new MarkdownGrayMatterParser(content.download_url)
      await parser.parse()

      const title = parser.getTitle()
      const createdAt = parser.getCreatedAt()
      const html = parser.getHtml()
      if (!title || !createdAt || !html) {
        throw new Error('title or createdAt is undefined')
      }

      items.push({
        title,
        link: url,
        'content:encoded': html,
        pubDate: createdAt.toUTCString(),
      })
    }

    return {
      status: true,
      items,
    }
  }
}

class MarkdownGrayMatterParser {
  private downloadUrl: string

  private title: string | undefined
  private createdAt: Date | undefined

  private content: string | undefined

  constructor(downloadUrl: string) {
    this.downloadUrl = downloadUrl
  }

  async parse(): Promise<void> {
    const markdown = await axios.get(this.downloadUrl)
    const { data: metadata, content } = matter(markdown.data)

    this.title = metadata.title
    this.createdAt = new Date(metadata.created)

    this.content = content
  }

  getTitle(): string | undefined {
    return this.title
  }

  getCreatedAt(): Date | undefined {
    return this.createdAt
  }

  getContent(): string | undefined {
    return this.content
  }

  getHtml(): string | undefined {
    if (!this.content) {
      return undefined
    }

    return marked(this.content, {
      mangle: false,
      headerIds: false,
    })
  }
}
