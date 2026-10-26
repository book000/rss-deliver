import { Item } from '@/model/collect-result'
import { parsePreviousFeed } from '@/utils/previous-feed'
import DisneyParksNewShows, {
  Candidate,
  mergeItems,
  parseOlcHtml,
  parseWordPressFeed,
  resolveDpbRegion,
  SourceFetcher,
} from '@/services/disney-parks-new-shows'
import { detectDeletedArticles } from '@/utils/deleted-articles-tracker'
import { classifyShow } from '@/utils/show-classifier'
import XMLBuilder from 'fast-xml-builder'
import fs from 'node:fs'

const NOW = new Date('2026-10-27T00:00:00Z')
const DAY_MS = 86_400_000
const BASE_URL = 'https://example.com/'

let failures = 0
let total = 0

/**
 * 期待値と実際の値を比較し、結果を出力する。
 * @param name ケース名
 * @param actual 実際の値
 * @param expected 期待値
 */
function check(name: string, actual: unknown, expected: unknown): void {
  total++
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`ok   ${name}`)
    return
  }
  failures++
  console.log(
    `FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  )
}

/**
 * NOW から指定ミリ秒だけ前の日時を返す。
 * @param ms 経過ミリ秒
 * @returns 日時
 */
function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

/**
 * 検証用のアイテムを作る。
 * @param path link の BASE_URL 以降
 * @param publishedAt 公開日時
 * @param title タイトル（省略時は path）
 * @returns アイテム
 */
function makeItem(path: string, publishedAt: Date, title = path): Item {
  const link = `${BASE_URL}${path}`
  return {
    title,
    link,
    guid: { '#text': link },
    pubDate: publishedAt.toUTCString(),
  }
}

/**
 * 検証用の候補を作る。
 * @param path link の BASE_URL 以降
 * @param title タイトル
 * @param publishedAt 公開日時
 * @param region 地域名
 * @returns 候補
 */
function makeCandidate(
  path: string,
  title: string,
  publishedAt: Date | undefined,
  region = 'A'
): Candidate {
  return {
    region,
    title,
    link: `${BASE_URL}${path}`,
    pubDate: publishedAt,
    summary: 's',
    bodyText: '',
  }
}

/**
 * 検証用の取得元を作る。Error を渡すと取得に失敗する。
 * @param name 取得元の名前
 * @param result 返す候補、または投げる例外
 * @returns 取得元
 */
function makeSource(name: string, result: Candidate[] | Error): SourceFetcher {
  return {
    name,
    fetch: () =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result),
  }
}

/**
 * 判定で落とされる記事を 1 件返すだけの、成功する取得元を作る。
 * @param name 取得元の名前
 * @returns 取得元
 */
function makeFillerSource(name: string): SourceFetcher {
  return makeSource(name, [
    makeCandidate(`${name}-filler`, 'Merchandise Guide', ago(DAY_MS), name),
  ])
}

/**
 * 文字列を辞書順に並べるための比較関数。
 * @param a 文字列
 * @param b 文字列
 * @returns 比較結果
 */
function compareText(a: string, b: string): number {
  return a.localeCompare(b)
}

/**
 * アイテムの link の一覧を返す。
 * @param items アイテム
 * @returns link の配列
 */
function links(items: Item[]): string[] {
  return items.map((item) => item.link)
}

/**
 * classifyShow の入力と期待値の組を検証する。
 * 誤検知と取りこぼしが見つかった記事は、再発を防ぐためにそのままケースにしている。
 */
function verifyClassifier(): void {
  const longFiller = 'park news and updates for guests. '.repeat(40)

  const accepted: [string, string, string, string][] = [
    ['A1', '新規ショー『ブリング・ザ・リズム！』', '', ''],
    ['A2', 'Introducing a New Parade at Disneyland Paris', '', ''],
    ['A3', 'Nouveau défilé de Noël', '', ''],
    ['A4', 'NOUVEAU DEFILE DE NOEL', '', ''],
    [
      'A5',
      'Pixar Summer Fest',
      '',
      'Guests can see the all-new Pixar parade debut this summer.',
    ],
    ['A6', 'The show reopens with a new parade', '', ''],
    ['A7', '新しい夜のキャッスルプロジェクションがスタート', '', ''],
    [
      'A8',
      '東京ディズニーシー「ハンガーステージ」で新エンターテイメントプログラムを開催',
      '',
      '',
    ],
    [
      'A9',
      '東京ディズニーシー新規ナイトタイムエンターテイメントがスタート',
      '',
      '',
    ],
    [
      'A10',
      'Hong Kong Disneyland presents the first-ever in-park live orchestra performance',
      '',
      '',
    ],
    [
      'A11',
      'Une toute nouvelle parade de jour au Parc Disneyland en 2028',
      '',
      '',
    ],
    [
      'A15',
      'Disney Starlight Nighttime Parade Coming to Magic Kingdom “Later This Summer”',
      '',
      '',
    ],
    [
      'A16',
      'Disneyland Paris to Unveil a New Spectacular Projected onto Sleeping Beauty Castle',
      '',
      '',
    ],
    [
      'A17',
      'All-New Nighttime Parade Coming to Magic Kingdom in Summer 2025',
      '',
      '',
    ],
    [
      'A18',
      'Two New Nighttime Spectaculars Coming to Disneyland Resort in 2023',
      '',
      '',
    ],
    [
      'A19',
      'BREAKING: Brand New Nighttime Spectacular to Replace “Wishes” Beginning May 12',
      '',
      '',
    ],
    [
      'A12',
      'Hong Kong Disneyland Resort to proudly present Much-anticipated Nighttime Spectacular “Momentous” in mid-June',
      '',
      '',
    ],
    [
      'A13',
      'Summer at the resort',
      '',
      `Guests will love the brand-new nighttime spectacular. ${longFiller}`,
    ],
    [
      'A14',
      'Resort update',
      '',
      `${longFiller}The new parade opens soon. ${longFiller}A second new show follows.`,
    ],
    ['A20', '新規ショー『ブリング・ザ・リズム！』'.normalize('NFD'), '', ''],
    ['A21', 'Nouveau défilé de Noël'.normalize('NFD'), '', ''],
    ['A22', '最新情報', '', 'ショーが 7 月に初披露されます。'],
    ['A23', 'Park news', '', 'The fireworks spectacular debuts on July 4.'],
    ['A24', 'Actualités du parc', '', 'Un défilé nouveau arrive cet été.'],
    ['A25', 'Actualités du parc', '', 'Les nouveaux feux d’artifice du parc.'],
    ['A26', 'All-New Show™ Coming to Disneyland', '', ''],
    ['A27', 'New™ Parade℠ Debuts This Summer', '', ''],
    ['A28', 'ＮＥＷ　ＰＡＲＡＤＥ　Ｄｅｂｕｔｓ', '', ''],
    ['A29', '新ｼｮｰがｽﾀｰﾄ', '', ''],
    ['A30', '初めてのショー', '', ''],
  ]
  for (const [name, title, summary, bodyText] of accepted) {
    check(name, classifyShow({ title, summary, bodyText }), true)
  }

  const rejected: [string, string, string, string, string][] = [
    ['R1', 'Holiday Parade Merchandise Guide', '', '', '運営・グッズ系の語'],
    ['R2', 'Parade Schedule Update', '', '', '新規を示す語が無い'],
    ['R3', 'Fireworks Show Returns This Summer', '', '', '毎年恒例の再開催'],
    ['R4', '今年もハロウィーンのパレードが復活', '', '', '毎年恒例の再開催'],
    [
      'R5',
      'Appointment of Independent Non-Executive Directors',
      '',
      '',
      '演目語なし',
    ],
    ['R6', '人事異動について', '', '', '演目語なし'],
    [
      'R7',
      'Indiana Jones et le Temple du Péril : fermeture pour rénovation',
      '',
      '',
      '演目語なし',
    ],
    [
      'R8',
      'Park Update',
      '',
      `${longFiller}${longFiller}the new parade is great. ${longFiller}`,
      '本文の奥での 1 回きりの付随的な言及',
    ],
    [
      'R9',
      'Shanghai Disney Resort Rings in the New Year with Fireworks',
      '',
      '',
      '`New Year` の new',
    ],
    [
      'R10',
      'Celebrate',
      '',
      `${longFiller}new year's fireworks and new year decorations.`,
      '`New Year` の new',
    ],
    [
      'R11',
      'JAL、東京ディズニーランド®の新規イースターパレードに協賛',
      '',
      '',
      '発表済みの演目への協賛の告知',
    ],
    [
      'R12',
      '「東京ディズニーリゾート・スペシャルドローンショー“マジック・イン・ジ・エア”」実施のお知らせ',
      '',
      '',
      '毎年恒例の実施と区別できないため採用しない',
    ],
    [
      'R13',
      'Fireworks Show Returns with New Finale',
      '',
      '',
      '恒例の演目の再開催（細かな変更）',
    ],
    [
      'R14',
      'Meet the Performer Who Brings His Heritage Center Stage',
      'A family tradition and a way to honor his heritage.',
      '',
      '`stage` だけでは演目語としない',
    ],
    [
      'R16',
      'Why Halloween on the High Seas is My New Favorite Fall Tradition',
      '',
      '',
      '演目語なし',
    ],
    [
      'R17',
      'Live in the Moment and Embrace a Spectacular Summer at Hong Kong Disneyland Resort',
      '',
      '',
      '形容詞の spectacular は演目語としない',
    ],
    [
      'R15',
      'Hong Kong Disneyland Resort Announces New Pricing Structure',
      '',
      '',
      '演目語なし',
    ],
    [
      'R18',
      'Parade Schedule Update',
      '',
      'The all-new parade debuts this summer.',
      '運営系の語を含むタイトルは、本文に新規の根拠があっても採用しない',
    ],
    [
      'R20',
      'New Parade Schedule Update',
      '',
      '',
      '運営情報（新規が隣接していても）',
    ],
    [
      'R21',
      'Brand-new parade merchandise now available',
      '',
      '',
      'グッズ（新規が隣接していても）',
    ],
    [
      'R22',
      '【最新】ショー公演中止のお知らせ',
      '',
      '',
      '中止（「最新」の新は新規ではない）',
    ],
    [
      'R23',
      'New Fireworks Show Returns This Summer',
      '',
      '',
      '恒例の再開催（新規が隣接していても）',
    ],
    [
      'R24',
      '今年も新パレードが復活',
      '',
      '',
      '恒例の再開催（新規が隣接していても）',
    ],
    [
      'R25',
      '更新情報',
      '',
      '最新情報 ショー',
      '「最新」「更新」の新は新規ではない',
    ],
    ['R26', 'ライブ配信の更新について', '', '', 'ライブ配信は演目ではない'],
    [
      'R27',
      'Disney announces strong financial performance',
      '',
      '',
      'performance は企業の業績にも使われるため、タイトルの演目語としない',
    ],
    [
      'R28',
      'Cast members launch concert for charity',
      '',
      '',
      'concert は発表を示す語と組み合わせてもタイトルの演目語としない',
    ],
    [
      'R29',
      'Disney announces New Year concert times',
      '',
      '',
      'New Year の new は新規ではない',
    ],
    [
      'R30',
      'Nouveautés du parc : drones',
      '',
      '',
      '語の途中の nouveau は新規ではない',
    ],
    [
      'R31',
      'Park update',
      '',
      'Enjoy new dining options and shows this season.',
      '新規と演目が別の名詞句にまたがる',
    ],
    [
      'R32',
      'Fireworks Show Reopens, Announced for Friday',
      '',
      '',
      '運営再開のみで、新規の根拠が無い',
    ],
    ['R33', '最新ショーのお知らせ', '', '', '「最新」の新は新規ではない'],
    ['R34', '刷新されたショーの映像', '', '', '「刷新」の新は新規ではない'],
    ['R35', '新作ライブ配信のお知らせ', '', '', 'ライブ配信は演目ではない'],
    [
      'R36',
      'お知らせ',
      '',
      `新規${'あ'.repeat(20)}ショー`,
      '新規と演目が離れている（文中の間隔の上限）',
    ],
  ]
  for (const [name, title, summary, bodyText, reason] of rejected) {
    check(
      `${name} (${reason})`,
      classifyShow({ title, summary, bodyText }),
      false
    )
  }

  const startedAt = performance.now()
  const dashes = classifyShow({
    title: 'Update',
    summary: '',
    bodyText: `new ${'-'.repeat(40_000)}x nouveau ${'-'.repeat(40_000)}x`,
  })
  check('R19 (ハイフンが長く続く本文でも二乗時間にならない)', dashes, false)
  check(
    'R19 elapsed time is under 1 second',
    performance.now() - startedAt < 1000,
    true
  )
}

/**
 * 保存済みサンプルを読み込む（pnpm はリポジトリルートで実行する前提）。
 * @param name サンプルのファイル名
 * @returns ファイルの内容
 */
function readFixture(name: string): string {
  return fs.readFileSync(`src/verify/fixtures/${name}`, 'utf8')
}

/**
 * 実際の記事に人が付けた正解ラベルと、classifyShow の判定が一致することを検証する。
 * 新作のショー・パレード等の告知を正例、協賛・毎年恒例・運営・企業情報・価格などを負例としている。
 * ルールの調整に使った記事を含むため、未知の記事に対する精度を保証するものではなく、退行の検知に使う。
 */
function verifyLabeledCorpus(): void {
  const items = JSON.parse(readFixture('classifier-corpus.json')) as {
    title: string
    summary: string
    bodyText: string
    expected: boolean
  }[]
  check('corpus: labeled articles', items.length, 35)
  check(
    'corpus: positives and negatives',
    [
      items.filter((item) => item.expected).length,
      items.filter((item) => !item.expected).length,
    ],
    [18, 17]
  )
  check(
    'corpus: every article is classified as labeled',
    items
      .filter((item) => classifyShow(item) !== item.expected)
      .map((item) => item.title),
    []
  )
}

/**
 * 各パーサーが、サンプルから独立に数えた件数の候補を返すことを検証する。
 * 期待件数は、サンプルの `<item>` と `li[entrydate]` を別途数えた値。
 */
function verifyParsers(): void {
  const dpbXml = readFixture('dpb.xml')
  check('dpb: all items', parseWordPressFeed(dpbXml, 'x').length, 10)
  const dpb = parseWordPressFeed(dpbXml, resolveDpbRegion)
  check('dpb: target-resort items', dpb.length, 4)
  check('dpb: excluded items', 10 - dpb.length, 6)
  check(
    'dpb: regions',
    dpb.map((candidate) => candidate.region).toSorted(compareText),
    [
      'Disneyland Resort (California)',
      'Walt Disney World Resort (Florida)',
      'Walt Disney World Resort (Florida)',
      'Walt Disney World Resort (Florida)',
    ]
  )

  const paris = parseWordPressFeed(readFixture('paris.xml'), 'Disneyland Paris')
  check('paris: items', paris.length, 10)
  check(
    'paris: title keeps the original text (entities decoded, U+00A0 kept)',
    paris[0].title,
    'Indiana Jones™ et le Temple du Péril : une rénovation d’envergure à partir de janvier 2027'
  )

  check(
    'hk: items',
    parseWordPressFeed(readFixture('hk.xml'), 'Hong Kong Disneyland Resort')
      .length,
    10
  )
  const shanghai = parseWordPressFeed(
    readFixture('shanghai.xml'),
    'Shanghai Disney Resort'
  )
  check('shanghai: items', shanghai.length, 10)
  check(
    'shanghai: every item has a date and an https link',
    shanghai.every(
      (candidate) =>
        candidate.pubDate !== undefined && candidate.link.startsWith('https://')
    ),
    true
  )

  const olc = parseOlcHtml(
    readFixture('olc-news.html.txt'),
    'https://www.olc.co.jp/ja/news.html'
  )
  check('olc: items', olc.length, 12)
  check(
    'olc: first title',
    olc[0].title,
    '日本初のディズニークルーズの船名を「ディズニー・イマジネーション」に決定'
  )
  check(
    'olc: first link is resolved to an absolute url',
    olc[0].link,
    'https://www.olc.co.jp/ja/news/news_olc/20261014_01/main/0/link/20261014_01.pdf'
  )
  check(
    'olc: first date is JST midnight',
    olc[0].pubDate?.toISOString(),
    '2026-10-13T15:00:00.000Z'
  )
  check('olc: region', olc[0].region, 'Tokyo Disney Resort')
}

/**
 * mergeItems の初回の除外、前回アイテムの引き継ぎ、識別子の正規化、整列を検証する。
 */
function verifyMerge(): void {
  const current = [
    makeItem('a', ago(6 * DAY_MS)),
    makeItem('b', ago(7 * DAY_MS)),
    makeItem('c', ago(7 * DAY_MS + 1000)),
  ]
  check(
    'merge: keeps current items up to 7 days old',
    links(mergeItems(current, [], NOW)),
    [`${BASE_URL}a`, `${BASE_URL}b`]
  )
  check(
    'merge: old current items are not published as new when previous items exist',
    links(
      mergeItems(current, [makeItem('unrelated', ago(DAY_MS))], NOW)
    ).toSorted(compareText),
    [`${BASE_URL}a`, `${BASE_URL}b`, `${BASE_URL}unrelated`]
  )
  check(
    'merge: an old previous item is kept while an old current item is not added',
    links(
      mergeItems(
        [makeItem('old-current', ago(30 * DAY_MS))],
        [makeItem('old-previous', ago(30 * DAY_MS))],
        NOW
      )
    ),
    [`${BASE_URL}old-previous`]
  )

  const previous = [
    makeItem('d89', ago(89 * DAY_MS)),
    makeItem('d90', ago(90 * DAY_MS)),
    makeItem('d90s', ago(90 * DAY_MS + 1000)),
    makeItem('d91', ago(91 * DAY_MS)),
  ]
  check(
    'merge: carries previous items up to 90 days old',
    links(mergeItems([], previous, NOW)),
    [`${BASE_URL}d89`, `${BASE_URL}d90`]
  )

  const overwritten = mergeItems(
    [makeItem('a', ago(DAY_MS), 'new content')],
    [makeItem('a/?x=1#y', ago(2 * DAY_MS), 'old content')],
    NOW
  )
  check(
    'merge: same normalized id gives one item',
    overwritten.map((item) => item.title),
    ['new content']
  )

  const sameTime = ago(DAY_MS)
  check(
    'merge: same pubDate is ordered by link',
    links(
      mergeItems([makeItem('z', sameTime), makeItem('y', sameTime)], [], NOW)
    ),
    [`${BASE_URL}y`, `${BASE_URL}z`]
  )
}

/**
 * 前回フィードのパースが、`<channel>` 内の `<item>` と、旧形式（`<rss>` 直下の `<item>`）の両方を読めることを検証する。
 */
function verifyPreviousFeed(): void {
  const inChannel =
    '<rss version="2.0"><channel><title>t</title>' +
    '<item><title>a</title><link>https://example.com/a</link></item>' +
    '<item><title>b</title><link>https://example.com/b</link></item>' +
    '</channel></rss>'
  check(
    'previous feed: items inside channel',
    parsePreviousFeed(inChannel).map((item) => item.link),
    ['https://example.com/a', 'https://example.com/b']
  )
  const legacySingle =
    '<rss version="2.0"><channel><title>t</title></channel>' +
    '<item><title>a</title><link>https://example.com/a</link></item></rss>'
  check(
    'previous feed: a single legacy item outside channel',
    parsePreviousFeed(legacySingle).map((item) => item.link),
    ['https://example.com/a']
  )
  check(
    'previous feed: no items',
    parsePreviousFeed(
      '<rss version="2.0"><channel><title>t</title></channel></rss>'
    ),
    []
  )
  check(
    'previous feed: a non-RSS response is rejected',
    (() => {
      try {
        parsePreviousFeed('<html><body>maintenance</body></html>')
        return 'no error'
      } catch (error) {
        return error instanceof Error ? error.message : 'unknown'
      }
    })(),
    'Previous feed is not an RSS document'
  )
}

/**
 * 値のない属性（例: `<guid isPermaLink>`）を持つ開始タグがあるかを返す。
 * @param xml XML 文字列
 * @returns 値のない属性がある場合は true
 */
function hasBareAttribute(xml: string): boolean {
  return /<[A-Za-z][\w:.-]*(?:\s+[\w:.-]+)+\s*>/.test(xml)
}

/**
 * collectFrom が返したアイテムから生成した RSS に、値のない属性が無いことを検証する。
 * main.ts と同じオプションの XMLBuilder で出力し、前回フィードとして読み戻せることも確認する。
 */
async function verifyOutputXml(): Promise<void> {
  const service = new DisneyParksNewShows()
  const result = await service.collectFrom(
    [
      makeSource('A', [makeCandidate('a/?x=1', 'New Parade', ago(DAY_MS))]),
      makeFillerSource('B'),
    ],
    [],
    NOW
  )
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true })
  const xml = builder.build({
    rss: {
      '@_version': '2.0',
      channel: { ...service.information(), item: result.items },
    },
  })
  check(
    'output xml: no attribute without a value',
    hasBareAttribute(xml),
    false
  )
  check(
    'output xml: guid has no attribute',
    xml.includes(`<guid>${BASE_URL}a/?x=1</guid>`),
    true
  )
  check(
    'output xml: detects a bare attribute (guard for the check itself)',
    hasBareAttribute('<item><guid isPermaLink>x</guid></item>'),
    true
  )
  check(
    'output xml: items are read back as previous items',
    parsePreviousFeed(xml).map((item) => item.link),
    [`${BASE_URL}a/?x=1`]
  )
}

/**
 * collectFrom の項目変換、取得元の失敗の分離、削除記事検出との関係を検証する。
 */
async function verifyCollect(): Promise<void> {
  const service = new DisneyParksNewShows()

  const converted = await service.collectFrom(
    [
      makeSource('A', [
        makeCandidate('a/?x=1', 'New Parade', ago(DAY_MS)),
        makeCandidate('nodate', 'New Show', undefined),
        {
          ...makeCandidate('js', 'New Show', ago(DAY_MS)),
          link: 'javascript:alert(1)',
        },
        makeCandidate('guide', 'Merchandise Guide', ago(DAY_MS)),
      ]),
      makeSource('B', [
        makeCandidate('a#frag', 'New Parade', ago(DAY_MS), 'B'),
      ]),
      makeFillerSource('C'),
      makeFillerSource('D'),
      makeFillerSource('E'),
    ],
    [],
    NOW
  )
  check('collect: status', converted.status, true)
  check('collect: one item for the same article', converted.items, [
    {
      title: 'New Parade',
      link: `${BASE_URL}a/?x=1`,
      description: '[A, B] s',
      category: 'A, B',
      guid: { '#text': `${BASE_URL}a/?x=1` },
      pubDate: ago(DAY_MS).toUTCString(),
    },
  ])

  const previousItems = [
    makeItem('failed-region', ago(30 * DAY_MS)),
    makeItem('other', ago(10 * DAY_MS)),
  ]
  const isolated = await service.collectFrom(
    [
      makeSource('A', new Error('connection reset')),
      makeSource('B', [makeCandidate('b', 'New Show', ago(2 * DAY_MS), 'B')]),
      makeFillerSource('C'),
      makeFillerSource('D'),
      makeFillerSource('E'),
    ],
    previousItems,
    NOW
  )
  check('isolation: status', isolated.status, true)
  check('isolation: keeps new and previous items', links(isolated.items), [
    `${BASE_URL}b`,
    `${BASE_URL}other`,
    `${BASE_URL}failed-region`,
  ])
  check(
    'isolation: a failed source is not detected as deleted',
    detectDeletedArticles(previousItems, isolated.items, 'DisneyParksNewShows')
      .length,
    0
  )
  const repeated = await service.collectFrom(
    [
      makeSource('A', new Error('connection reset')),
      makeSource('B', [makeCandidate('b', 'New Show', ago(2 * DAY_MS), 'B')]),
      makeFillerSource('C'),
      makeFillerSource('D'),
      makeFillerSource('E'),
    ],
    previousItems,
    NOW
  )
  check('isolation: output is idempotent', repeated, isolated)

  const expired = makeItem('expired', ago(91 * DAY_MS))
  const afterExpiry = await service.collectFrom(
    [
      makeSource('A', [makeCandidate('b', 'New Show', ago(2 * DAY_MS), 'B')]),
      makeFillerSource('B'),
      makeFillerSource('C'),
      makeFillerSource('D'),
      makeFillerSource('E'),
    ],
    [...previousItems, expired],
    NOW
  )
  check(
    'expiry: items older than 90 days are dropped',
    links(afterExpiry.items).includes(expired.link),
    false
  )
  check(
    'expiry: only the expired item is detected as deleted',
    detectDeletedArticles(
      [...previousItems, expired],
      afterExpiry.items,
      'DisneyParksNewShows'
    ).map((article) => article.id),
    [expired.link]
  )

  const allFailed = await service.collectFrom(
    ['A', 'B', 'C', 'D', 'E'].map((name) =>
      makeSource(name, new Error('connection reset'))
    ),
    previousItems,
    NOW
  )
  check('all failed: status', allFailed.status, false)
  const allEmpty = await service.collectFrom(
    ['A', 'B', 'C', 'D', 'E'].map((name) => makeSource(name, [])),
    previousItems,
    NOW
  )
  check('all empty: status', allEmpty.status, false)
}

/**
 * 検証を実行し、1 件でも失敗した場合は終了コードを非 0 にする。
 */
async function main(): Promise<void> {
  verifyClassifier()
  verifyLabeledCorpus()
  verifyParsers()
  verifyMerge()
  verifyPreviousFeed()
  await verifyCollect()
  await verifyOutputXml()

  console.log(`${total - failures}/${total} passed`)
  if (failures > 0) {
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
