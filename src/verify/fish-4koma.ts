import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import Fish4Koma from '@/services/fish-4koma'

async function verify(): Promise<void> {
  const originalFetch = fetch
  const originalDirectory = process.cwd()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-4koma-'))
  try {
    process.chdir(directory)
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer()
    for (const [count, failure, failedIndex] of [
      [2, 'page', 2],
      [2, 'missing', 2],
      [2, 'image', 2],
      [2, 'page', 0],
      [1, 'image', 1],
      [1, 'none', 0],
      [2, 'none', 0],
    ] as const) {
      const entries = Array.from(
        { length: count },
        (_, index) =>
          `<item><title>Article ${index + 1}</title><link>https://example.com/article${index + 1}</link><description>Test</description><dc:date>2026-01-01</dc:date></item>`
      ).join('')
      globalThis.fetch = (input) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.endsWith('index.rdf'))
          return Promise.resolve(new Response(`<rdf:RDF>${entries}</rdf:RDF>`))
        const index = Number(/(\d)(?:\.png)?$/.exec(url)?.[1])
        const fails = failedIndex === 0 || index === failedIndex
        if (url.includes('/article')) {
          if (fails && failure === 'page')
            return Promise.resolve(new Response('', { status: 503 }))
          const html =
            fails && failure === 'missing'
              ? ''
              : `<div class="article-body-inner"><img src="https://livedoor.blogimg.jp/image${index}.png"></div>`
          return Promise.resolve(new Response(html))
        }
        return Promise.resolve(
          fails && failure === 'image'
            ? new Response('', { status: 503 })
            : new Response(new Uint8Array(image))
        )
      }
      const result = await new Fish4Koma().collect()
      assert.equal(result.status, failure === 'none', `${count} ${failure}`)
      assert.equal(result.items.length, failure === 'none' ? count : 0)
    }
    console.log('Fish4Koma verification passed')
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
