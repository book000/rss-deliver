import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import { BaseService } from './BaseService'
import { Logger } from './logger'
import FF14LodestoneMaintenance from './services/ff14-lodestone-maintenance'
import FF14LodestoneNews from './services/ff14-lodestone-news'
import FF14LodestoneObstacle from './services/ff14-lodestone-obstacle'
import FF14LodestoneUpdate from './services/ff14-lodestone-update'
import PhysicalUpLettuceClub from './services/physical-up-lettuce-club'
import PopTeamEpic7 from './services/pop-team-epic7'
import Rikei2LettuceClub from './services/rikei-2-lettuce-club'
import SekanekoBlog from './services/sekaneko-blog'
import ZennChangelog from './services/zenn-changelog'

async function generateRSS() {
  const logger = Logger.configure('main.generateRSS')
  logger.info('✨ Generating RSS...')
  const services: BaseService[] = [
    new ZennChangelog(),
    new FF14LodestoneNews(),
    new FF14LodestoneMaintenance(),
    new FF14LodestoneUpdate(),
    new FF14LodestoneObstacle(),
    new SekanekoBlog(),
    new PhysicalUpLettuceClub(),
    new PopTeamEpic7(),
    new Rikei2LettuceClub(),
  ]
  const promises = []
  for (const service of services) {
    promises.push((async () => {
      const filename = service.constructor.name
      logger.info(`📝 Generating ${filename}...`)
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
      logger.info(`✅ Generated ${filename}`)
    })())
  }

  await Promise.all(promises)
}

async function generateList() {
  const logger = Logger.configure('main.generateList')
  logger.info('✨ Generating list...')
  const files = fs.readdirSync('output')
  const template = fs.readFileSync('template.html', 'utf8')
  const list = files
    .map((file) => {
      if (!file.endsWith('.xml')) {
        return null
      }
      const parser = new XMLParser({
        ignoreAttributes: false,
      })

      const feed = parser.parse(fs.readFileSync('output/' + file, 'utf8'))
      const title = feed.rss.channel.title
      return "<li><a href='" + file + "'>" + title + '</a></li>'
    })
    .filter((s) => s !== null)
  fs.writeFileSync(
    'output/index.html',
    template.replace('{{ RSS-FILES }}', '<ul>' + list.join('\n') + '</ul>')
  )
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
