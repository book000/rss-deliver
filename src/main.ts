import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import { BaseService } from './BaseService'
import ZennChangelog from './services/zenn-changelog'

async function generateRSS() {
  console.log('Generating RSS...')
  const services: BaseService[] = [new ZennChangelog()]
  for (const service of services) {
    const filename = service.constructor.name
    console.time(service.information().title)
    console.info(service.information().title, filename)
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
    })

    const collect = await service.collect()
    const obj = {
      '?xml': {
        '@_version': '1.0',
        '@_encoding': 'UTF-8',
      },
      rss: {
        '@_version': '2.0',
        '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        '@_xmlns:atom': 'http://www.w3.org/2005/Atom',
        channel: service.information(),
        item: collect.items,
      },
    }

    const feed = builder.build(obj)

    fs.writeFileSync('output/' + filename + '.xml', feed.toString())
    console.timeEnd(service.information().title)
  }
}

async function generateList() {
  console.log('Generating list...')
  const files = fs.readdirSync('output')
  const header = '# rss-deliver\n\n## RSS files\n\n'
  const list = files.map((file) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
    })

    const feed = parser.parse(fs.readFileSync('output/' + file, 'utf8'))
    const title = feed.rss.channel.title
    return (
      '- [' +
      title +
      '](https://book000.github.io/rss-deliver/' +
      file +
      '.xml)'
    )
  })
  fs.writeFileSync('README.md', header + list.join('\n'))
}

async function main() {
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output')
  }

  await generateRSS()
  await generateList()
}

;(async () => {
  await main()
})()
