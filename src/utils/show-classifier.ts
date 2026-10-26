/**
 * ショー・パレード判定への入力
 */
export interface ClassifyInput {
  /** 公式記事の原文タイトル */
  title: string
  /** 概要（無い場合は空文字） */
  summary: string
  /** 本文のプレーンテキスト（無い場合は空文字） */
  bodyText: string
}

/** タイトルの判定にも使う、曖昧さの少ない演目を表す語（英語） */
const STRONG_SHOW_EN = `(?:shows?|parades?|cavalcades?|fireworks|nighttime spectaculars?|night spectaculars?|projection(?: mapping| shows?)?|drone shows?|light shows?|musicals?|theat(?:er|re) shows?)`

/** 演目を表す語（英語）。`performance` は企業の業績にも使われるため、タイトルの判定には使わない */
const SHOW_EN = `(?:${STRONG_SHOW_EN}|concerts?|performances?)`

/** 新規を表す語（英語）。`New Year` の new は含めない */
const NEW_EN = String.raw`(?:all-new|brand-new|new(?!\s+years?(?![a-z0-9]))|first-ever|never-before-seen)`

/** 演目を表す語（フランス語。アクセント除去後） */
const SHOW_FR = `(?:spectacles?|defiles?|parades?|cavalcades?|feux d'artifice|shows?|projections?|drones?)`

/** 新規を表す語（フランス語。アクセント除去後） */
const NEW_FR = `(?:nouveaux?|nouvelles?|inedit(?:e|s|es)?)`

/** 演目を表す語（日本語）。`ライブ配信` は演目ではない */
const SHOW_JA = `(?:ショー|パレード|花火|プロジェクション|ミュージカル|ライブ(?!配信)|エンターテイメント|エンターテインメント)`

/** 新規を表す語（日本語）。`最新`・`更新` などの「新」は含めない */
const NEW_JA = `(?<![最更刷改])(?:新規|新作|新しい|新たな|新(?=[ァ-ヶー]))|初(?:登場|披露|公演|めて)`

/** 演目の開始・初披露を表す語（日本語） */
const START_JA = `(?:スタート|登場|初披露|お披露目|デビュー|開幕|初公演)`

/** 本文の冒頭として扱う文字数（付随的な言及ではなく、記事の主題かを見分ける） */
const LEAD_LENGTH = 700

/** 冒頭に無い場合に、記事の主題とみなす本文全体での言及回数 */
const MIN_MENTIONS = 2

/**
 * 語の区切り（英語・フランス語）。
 * 語を構成する文字 `[a-z0-9'&-]` と重ならないようにする。重なると、ハイフンが続く入力で分割の組み合わせが二乗で増える。
 */
const SEP = String.raw`[\s,:"“”‘’]+`

/** 別の名詞句に移ることを示す並列・付随の語（英語・フランス語）。語の間には許さない。演目名に含まれる `in`・`of` は許す */
const BREAK_WORD = `(?:and|or|plus|with|but|et|ou|avec)(?![a-z0-9'&-])`

/** 語の間に許す単語数（英語・フランス語）。別の名詞句にまたがる場合は一致させない */
const WORDS = `(?:(?!${BREAK_WORD})[a-z0-9'&-]+${SEP}){0,3}?`

/** 文の区切りを越えない範囲（日本語） */
const JA_GAP = String.raw`[^。\n]`

/**
 * 全出現箇所を数えられるよう、グローバルフラグ付きの正規表現を作る。
 * @param source 正規表現のソース
 * @returns グローバルな正規表現
 */
function globalPattern(source: string): RegExp {
  return new RegExp(source, 'g')
}

/**
 * 演目の新規発表とみなす、文中の「新規 + 演目」「演目 + 初披露」の形。
 * 「新規」と「演目」が離れて出現するだけでは一致させない（長い本文では、どの語も偶然に近接するため）。
 */
const NEW_SHOW_PATTERNS: RegExp[] = [
  globalPattern(
    `(?<![a-z0-9])${NEW_EN}${SEP}${WORDS}(?:${SHOW_EN}|spectaculars?)(?![a-z0-9])`
  ),
  globalPattern(
    String.raw`(?<![a-z0-9])${SHOW_EN}(?![a-z0-9])[^.!?\n]{0,60}?(?<![a-z0-9])(?:debuts?|debuting|premieres?|premiering|unveil(?:s|ed|ing)?|makes its debut)(?![a-z0-9])`
  ),
  globalPattern(`(?<![a-z0-9])${NEW_FR}${SEP}${WORDS}${SHOW_FR}(?![a-z0-9])`),
  globalPattern(`(?<![a-z0-9])${SHOW_FR}${SEP}${WORDS}${NEW_FR}(?![a-z0-9])`),
  globalPattern(`(?:${NEW_JA})${JA_GAP}{0,12}?${SHOW_JA}`),
  globalPattern(`${SHOW_JA}${JA_GAP}{0,30}?${START_JA}`),
]

/** タイトルに演目語があるときに、新規の発表とみなす語（演目語と隣接していなくてよい） */
const TITLE_CUE = new RegExp(
  [
    String.raw`(?<![a-z0-9])(?:all-new|brand-new|new(?!\s+years?(?![a-z0-9]))|first-ever|debut(?:s|ing)?|premiere[sd]?|unveil(?:s|ed|ing)?|introduc\w*|announce[sd]?|launch(?:es|ed)?|present(?:s|ing)?|arrives?|coming (?:to|soon|this|next|in))(?![a-z0-9])`,
    String.raw`(?<![a-z0-9])(?:nouveaux?|nouvelles?|inedit\w*|devoile\w*)(?![a-z0-9])`,
    NEW_JA,
    'スタート|登場|デビュー|お披露目|開幕',
  ].join('|')
)

/** 演目語（タイトル用）。隣接を求めないため、曖昧な語は含めない */
const TITLE_SHOW = new RegExp(
  `(?<![a-z0-9])${STRONG_SHOW_EN}(?![a-z0-9])|(?<![a-z0-9])${SHOW_FR}(?![a-z0-9])|${SHOW_JA}`
)

/** 発表済みの演目への協賛・提供の告知を示す語。新規が隣接していても新作の発表ではない */
const SPONSOR_TITLE = /(?<![a-z0-9])sponsor\w*|協賛|提供/

/** 運営情報・グッズなど、新作の発表ではない記事を示す語。新規が隣接していても新作の発表ではない */
const OPERATION_TITLE =
  /(?<![a-z0-9])(?:closures?|schedules?|merchandise|gifts?|recipes?)(?![a-z0-9])|休止|中止|グッズ|fermeture/

/** 毎年恒例の再開催を示す語。新規が隣接していても新作の発表ではない */
const RECURRING_TITLE =
  /(?<![a-z0-9])(?:returns?|returning|back|annual)(?![a-z0-9])|復活|今年も|年度も|revient|retour/

/** 運営再開を示す語。タイトルに「新規 + 演目」の形があれば（再開と同時の新作として）新作の発表を優先する */
const REOPEN_TITLE = /(?<![a-z0-9])reopen\w*|再開|reouverture/

/**
 * 照合用に文字列を正規化する。
 * 全角・半角を統一し、ラテン文字のアクセント記号を除去して小文字化する。
 * 日本語の濁点（結合文字）は、除去せずに再結合して残す。
 * 商標記号（™・℠）は NFKD で `TM`・`SM` の文字になり、語の途中に挟まって一致を妨げるため、先に除去する。
 * @param text 対象文字列
 * @returns 正規化後の文字列
 */
function normalize(text: string): string {
  return text
    .replaceAll(/[™℠]/g, '')
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll('’', "'")
    .normalize('NFKC')
}

/**
 * 「新規 + 演目」「演目 + 初披露」の形に一致した文字列をすべて返す。
 * @param text 正規化済みの対象文字列
 * @returns 一致した文字列の配列
 */
function findMatches(text: string): string[] {
  return NEW_SHOW_PATTERNS.flatMap((pattern) =>
    text
      .matchAll(pattern)
      .map((match) => match[0])
      .toArray()
  )
}

/**
 * 新作のショー・パレード等の発表とみなした根拠の文字列を返す。
 *
 * 次の順に判定する。
 * 1. タイトルが協賛・提供の告知、運営情報・グッズ、毎年恒例の再開催を示す場合は採用しない。
 * 2. タイトル自体に「新規 + 演目」の形がある場合は採用する（運営再開を示す語より優先する）。
 * 3. 次のいずれかを満たし、かつタイトルが運営再開を示さない場合に採用する。
 *    - タイトルに演目語と、新規・発表を示す語がある。
 *    - 概要と本文の冒頭に「新規 + 演目」の形がある。
 *    - 本文全体に「新規 + 演目」の形が複数回ある（記事が繰り返し新作を扱っている）。
 * @param input タイトル・概要・本文
 * @returns 根拠として一致した文字列（正規化後）。採用しない場合は undefined
 */
export function findNewShowEvidence(input: ClassifyInput): string | undefined {
  const title = normalize(input.title)
  if (
    SPONSOR_TITLE.test(title) ||
    OPERATION_TITLE.test(title) ||
    RECURRING_TITLE.test(title)
  ) {
    return undefined
  }
  const titleMatches = findMatches(title)
  if (titleMatches.length > 0) {
    return titleMatches.at(0)
  }
  if (REOPEN_TITLE.test(title)) {
    return undefined
  }

  const lead = normalize(
    `${input.title}\n${input.summary}\n${input.bodyText.slice(0, LEAD_LENGTH)}`
  )
  const all = normalize(`${input.title}\n${input.summary}\n${input.bodyText}`)
  const allMatches = findMatches(all)
  const titleCue =
    TITLE_SHOW.test(title) && TITLE_CUE.test(title) ? title : undefined
  return (
    titleCue ??
    findMatches(lead).at(0) ??
    (allMatches.length >= MIN_MENTIONS ? allMatches.at(0) : undefined)
  )
}

/**
 * 新作のショー・パレード等の発表記事かどうかをルールベースで判定する。
 * 判定の詳細は {@link findNewShowEvidence} を参照。
 * @param input タイトル・概要・本文
 * @returns 採用する場合は true
 */
export function classifyShow(input: ClassifyInput): boolean {
  return findNewShowEvidence(input) !== undefined
}
