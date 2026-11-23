import assert from 'node:assert/strict'
import PopTeamEpic from '@/services/pop-team-epic'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const series =
  '<meta property="og:title" content="Title"><meta property="og:image" content="https://example.com/image.jpg">'
const originalFetch = fetch

async function verify(): Promise<void> {
  const cases = [
    { name: 'HTTP failure', body: '', status: 503 },
    { name: 'malformed XML', body: '<rss><channel></rss>', status: 200 },
    {
      name: 'missing items',
      body: '<rss><channel></channel></rss>',
      status: 200,
    },
    {
      name: 'unusable item',
      body: '<rss><channel><item><title>Title</title></item></channel></rss>',
      status: 200,
    },
  ]

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pop-team-epic-'))
  const originalDirectory = process.cwd()
  try {
    process.chdir(directory)
    for (const testCase of cases) {
      globalThis.fetch = (input) =>
        Promise.resolve(
          (input instanceof Request ? input.url : input.toString()).endsWith(
            '/rss'
          )
            ? new Response(testCase.body, { status: testCase.status })
            : new Response(series)
        )
      await assert.rejects(new PopTeamEpic().collect(), Error, testCase.name)
    }

    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer()
    for (const failed of [1, 2, 0]) {
      const entries = [1, 2]
        .map(
          (index) =>
            `<item><title>Episode ${index}</title><link>https://example.com/episode${index}</link><media:thumbnail url="https://example.com/image${index}.png"/></item>`
        )
        .join('')
      globalThis.fetch = (input) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.endsWith('/rss'))
          return Promise.resolve(
            new Response(`<rss><channel>${entries}</channel></rss>`)
          )
        if (url.includes('/series/'))
          return Promise.resolve(new Response(series))
        if (url.includes('/image')) {
          return Promise.resolve(
            url.includes(`image${failed}.`)
              ? new Response('', { status: 503 })
              : new Response(new Uint8Array(image))
          )
        }
        return Promise.resolve(new Response('', { status: 503 }))
      }
      if (failed) {
        await assert.rejects(new PopTeamEpic().collect(), /No images/)
      } else {
        const result = await new PopTeamEpic().collect()
        assert.equal(result.items.length, 2)
      }
    }
    globalThis.fetch = (input) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.endsWith('/rss'))
        return Promise.resolve(
          new Response(
            '<rss><channel><item><title>Episode</title><link>https://example.com/episode</link></item></channel></rss>'
          )
        )
      if (url.includes('/series/')) return Promise.resolve(new Response(series))
      return Promise.resolve(new Response('', { status: 503 }))
    }
    await assert.rejects(new PopTeamEpic().collect(), /No images/)
    console.log('PopTeamEpic RSS verification passed')
  } finally {
    globalThis.fetch = originalFetch
    process.chdir(originalDirectory)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

void verify()
