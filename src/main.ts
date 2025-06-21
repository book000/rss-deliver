import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import fs from 'node:fs'
import { BaseService } from './base-service'
import { Logger } from '@book000/node-utils'
import FF14LodestoneMaintenance from './services/ff14-lodestone-maintenance'
import FF14LodestoneNews from './services/ff14-lodestone-news'
import FF14LodestoneObstacle from './services/ff14-lodestone-obstacle'
import FF14LodestoneUpdate from './services/ff14-lodestone-update'
import PhysicalUpLettuceClub from './services/physical-up-lettuce-club'
import Rikei2LettuceClub from './services/rikei-2-lettuce-club'
import ZennChangelog from './services/zenn-changelog'
import Dev1and from './services/dev1and'
import TdrUpdates from './services/tdr-updates'
import PopTeamEpic from './services/pop-team-epic'
import Fish4Koma from './services/fish-4koma'

async function generateRSSService(service: BaseService) {
  const filename = service.constructor.name
  const logger = Logger.configure(`main.generateRSSService#${filename}`)
  logger.info(`📝 Generating ${filename}...`)
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
  })

  const collect = await service.collect()
  if (!collect.status) {
    logger.warn(`❌ ${filename} is not available`)
    return
  }

  // pubDateを処理
  const processedItems = await service.processPubDates(collect.items)

  const object = {
    '?xml': {
      '@_version': '1.0',
      // eslint-disable-next-line unicorn/text-encoding-identifier-case
      '@_encoding': 'UTF-8',
    },
    rss: {
      '@_version': '2.0',
      '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      '@_xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
      '@_xmlns:atom': 'http://www.w3.org/2005/Atom',
      channel: service.information(),
      item: processedItems,
    },
  }

  const feed: {
    toString: () => string
  } = builder.build(object)

  fs.writeFileSync('output/' + filename + '.xml', feed.toString())
  logger.info(`✅ Generated ${filename}`)
}

async function generateRSS() {
  const logger = Logger.configure('main.generateRSS')
  logger.info('✨ Generating RSS...')
  const services: BaseService[] = [
    new ZennChangelog(),
    new FF14LodestoneNews(),
    new FF14LodestoneMaintenance(),
    new FF14LodestoneUpdate(),
    new FF14LodestoneObstacle(),
    new PhysicalUpLettuceClub(),
    new Rikei2LettuceClub(),
    new Dev1and(),
    new TdrUpdates(),
    new PopTeamEpic(),
    new Fish4Koma(),
  ]
  const promises: Promise<void>[] = services.map((service) =>
    generateRSSService(service).catch((error: unknown) => {
      logger.error(
        `❌ Error occurred while generating RSS: ${service.constructor.name}`,
        error as Error
      )
    })
  )

  await Promise.all(promises)
}

function generateList() {
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

      const feed: {
        rss: {
          channel: {
            title: string
          }
        }
      } = parser.parse(fs.readFileSync('output/' + file, 'utf8'))
      const title = feed.rss.channel.title
      return "<li><a href='" + file + "'>" + title + '</a></li>'
    })
    .filter((s) => s !== null)
  fs.writeFileSync(
    'output/index.html',
    template.replace('{{ RSS-FILES }}', '<ul>' + list.join('\n') + '</ul>')
  )
  logger.info('✅ Generated list')
}

async function main() {
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output')
  }

  await generateRSS()
  generateList()
}

;(async () => {
  await main()
})()
