import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { carryOverPreviousFeed } from '@/utils/previous-feed'

const originalDirectory = process.cwd()
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'previous-feed-'))
const originalFetch = fetch
const hash = '0123456789abcdef0123456789abcdef'

async function verify() {
  try {
    process.chdir(directory)
    fs.mkdirSync('output')
    const requests: string[] = []
    globalThis.fetch = (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      requests.push(url)
      if (url.endsWith('.xml')) {
        const asset = url.includes('Fish4Koma')
          ? `fish4koma/${hash}.jpg`
          : `tdr-updates/${hash}.png`
        const html = `<img src="https://book000.github.io/rss-deliver/${asset}"><img src="https://example.com/image.png">`
        return Promise.resolve(
          new Response(
            `<rss><channel><item><content:encoded><![CDATA[${html}]]></content:encoded></item></channel></rss>`
          )
        )
      }
      return Promise.resolve(new Response('image bytes'))
    }
    for (const [service, asset] of [
      ['Fish4Koma', `fish4koma/${hash}.jpg`],
      ['TdrUpdates', `tdr-updates/${hash}.png`],
    ]) {
      assert.equal(await carryOverPreviousFeed(service), 'preserved')
      assert.equal(fs.readFileSync(`output/${asset}`, 'utf8'), 'image bytes')
      assert.ok(
        fs.readFileSync(`output/${service}.xml`, 'utf8').includes(asset)
      )
    }
    assert.equal(
      requests.some((url) => url.startsWith('https://example.com')),
      false
    )
    globalThis.fetch = () =>
      Promise.resolve(new Response(null, { status: 404 }))
    assert.equal(await carryOverPreviousFeed('NeverPublished'), 'not-found')
    globalThis.fetch = () =>
      Promise.resolve(new Response(null, { status: 503 }))
    assert.equal(await carryOverPreviousFeed('Unavailable'), 'error')
    fs.rmSync(`output/fish4koma/${hash}.jpg`)
    fs.rmSync('output/Fish4Koma.xml')
    globalThis.fetch = () => Promise.resolve(new Response('', { status: 503 }))
    assert.equal(await carryOverPreviousFeed('Fish4Koma'), 'error')
    assert.equal(fs.existsSync('output/Fish4Koma.xml'), false)
  } finally {
    globalThis.fetch = originalFetch
    process.chdir(originalDirectory)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

verify().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
