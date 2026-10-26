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

const SHOW_TERMS = [
  'show',
  'parade',
  'fireworks',
  'nighttime',
  'projection',
  'drone',
  'cavalcade',
  'spectacular',
  'stage',
  'ショー',
  'パレード',
  '花火',
  'プロジェクションマッピング',
  'ドローン',
  'spectacle',
  'défilé',
  "feux d'artifice",
  'nocturne',
]

const NEW_TERMS = [
  'new',
  'all-new',
  'debut',
  'premiere',
  'unveil',
  'introduc',
  'announce',
  'world premiere',
  '新規',
  '新作',
  '新',
  '初',
  'スタート',
  '登場',
  'nouveau',
  'nouvelle',
  'inédit',
  'dévoil',
  'première',
]

const EXCLUDE_TERMS = [
  'reopen',
  'closure',
  'schedule',
  'merchandise',
  'gift',
  'recipe',
  '再開',
  '休止',
  '中止',
  'グッズ',
  'réouverture',
  'fermeture',
]

const RECURRING_TERMS = [
  'returns',
  'back',
  'annual',
  'returning',
  '復活',
  '今年も',
  'revient',
  'retour',
]

/** 本文中の演目語の前後で新規語を探す文字数 */
const BODY_WINDOW = 120

/**
 * 照合用に文字列を正規化する。
 * 日本語の濁点（結合文字）を壊さないよう、除去するのはラテン文字のアクセント記号のみ。
 * @param text 対象文字列
 * @returns アクセント除去・小文字化・アポストロフィ統一済みの文字列
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll('’', "'")
    .normalize('NFC')
}

/**
 * 語彙から照合用の正規表現を作る。
 * ラテン文字の語彙は語頭一致（複数語は語間の空白 1 個以上）、日本語の語彙は部分一致とする。
 * @param term 語彙
 * @returns グローバルな正規表現
 */
function termToRegExp(term: string): RegExp {
  const normalized = normalize(term)
  const escaped = normalized.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
  const isLatin = /^[ -~]+$/.test(normalized)
  return new RegExp(
    isLatin
      ? `(?<![a-z0-9])${escaped.replaceAll(' ', String.raw`\s+`)}`
      : escaped,
    'g'
  )
}

const SHOW_PATTERNS = SHOW_TERMS.map((term) => termToRegExp(term))
const NEW_PATTERNS = NEW_TERMS.map((term) => termToRegExp(term))
const EXCLUDE_PATTERNS = EXCLUDE_TERMS.map((term) => termToRegExp(term))
const RECURRING_PATTERNS = RECURRING_TERMS.map((term) => termToRegExp(term))

/**
 * いずれかのパターンに一致するかを返す。
 * @param patterns 照合用パターン
 * @param text 正規化済みの対象文字列
 * @returns 一致する場合は true
 */
function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

/**
 * 本文中の演目語の前後 BODY_WINDOW 文字以内に新規語があるかを返す。
 * @param body 正規化済みの本文
 * @returns 条件を満たす演目語の出現箇所がある場合は true
 */
function hasNewTermNearShowTerm(body: string): boolean {
  for (const showPattern of SHOW_PATTERNS) {
    for (const match of body.matchAll(showPattern)) {
      const start = match.index
      const end = start + match[0].length
      const before = body.slice(Math.max(0, start - BODY_WINDOW), start)
      const after = body.slice(end, end + BODY_WINDOW)
      if (matchesAny(NEW_PATTERNS, before) || matchesAny(NEW_PATTERNS, after)) {
        return true
      }
    }
  }
  return false
}

/**
 * 新作のショー・パレード等の記事かどうかをルールベースで判定する。
 * 取りこぼしを避けるため、誤検知は許容し、迷う場合は採用側に倒す。
 * @param input タイトル・概要・本文
 * @returns 採用する場合は true
 */
export function classifyShow(input: ClassifyInput): boolean {
  const title = normalize(input.title)
  const summary = normalize(input.summary)
  const body = normalize(input.bodyText)

  const isShowArticle =
    matchesAny(SHOW_PATTERNS, title) ||
    matchesAny(SHOW_PATTERNS, summary) ||
    hasNewTermNearShowTerm(body)
  const isDropped =
    !matchesAny(NEW_PATTERNS, title) &&
    (matchesAny(EXCLUDE_PATTERNS, title) ||
      matchesAny(RECURRING_PATTERNS, title))
  return isShowArticle && !isDropped
}
