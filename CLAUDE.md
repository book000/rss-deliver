# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

- **Purpose**: RSS collector and deliverer for personal use.
- **What it does**: collects feeds from several sources, tracks deleted articles across runs, and generates RSS XML files as output.
- **Runs**: hourly via the `Update RSS` GitHub Actions workflow (and on push / manual dispatch).

## Development commands

```bash
pnpm install        # install dependencies (pnpm only; enforced by preinstall)
pnpm start          # run once (tsx ./src/main.ts) — generates the RSS XML
pnpm dev            # watch mode (tsx watch)
pnpm lint           # run-z: lint:prettier, lint:eslint, lint:tsc
pnpm lint:eslint    # ESLint (eslint.config.mjs)
pnpm lint:prettier  # Prettier check (src only)
pnpm lint:tsc       # tsc type-check (no emit path used for linting)
pnpm fix            # run-z: fix:prettier, fix:eslint
```

There is no build step in normal use; `pnpm start` executes the TypeScript directly via `tsx`.

## Conventions

- **Conversation language**: Japanese.
- **Code comments**: Japanese. **Error messages / log text**: English.
- Insert a half-width space between Japanese and alphanumeric characters.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), `<type>(<scope>): <description>`, description in Japanese (e.g. `feat(rss): 新しい RSS フィード取得機能を追加`).
- **Branches**: [Conventional Branch](https://conventional-branch.github.io) short form, `<type>/<description>` (e.g. `feat/add-new-rss-service`).
- **Naming**: classes `PascalCase`, functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`.
- **TypeScript**: `strict` mode. Declare types explicitly; avoid `any`. `skipLibCheck` is forbidden.
- **JSDoc**: document functions and interfaces in Japanese.
- **Imports**: use the `@/*` path alias (maps to `src/*`, defined in `tsconfig.json`) inside `src/services`, `src/utils`, etc. `src/main.ts` and `src/base-service.ts` currently use relative imports.
- Do not add commits to Renovate-created PRs.

## Tech stack

- TypeScript (ESM), Node.js (version pinned in `.node-version`), package manager pnpm (see `packageManager` in `package.json`).
- Key libraries: `cheerio` (HTML parsing), `fast-xml-parser` / `fast-xml-builder` (RSS XML), `node-ical`, `canvas`, `sharp`, `pdfjs-dist`. HTTP is done with the built-in `fetch` — there is no HTTP client dependency (no `axios`).
- Logging: `Logger` from `@book000/node-utils`.

## Architecture and key files

```
src/
├── main.ts                    # entry point: runs every service, builds RSS XML, tracks deletions
├── base-service.ts            # abstract BaseService (information / collect / processPubDates)
├── types.d.ts                 # ambient type declarations
├── services/                  # one file per RSS source (registered in main.ts)
├── model/                     # collect-result.ts, service-information.ts, deleted-article.ts
└── utils/
    ├── previous-feed.ts             # loads the previous feed, inherits pubDate
    ├── deleted-articles-tracker.ts  # tracks/persists deleted articles (JSON history)
    └── article-fetcher.ts           # fetch + cheerio extraction with on-disk cache (.article-cache)
template.html                  # HTML template used for output
```

Services currently registered in `main.ts`: Zenn Changelog, FF14 Lodestone (news / maintenance / update / obstacle), Lettuce Club (physical-up / rikei), dev1and, TDR Updates, Pop Team Epic, Fish 4koma, GitHub Events.

### Adding a new RSS service

1. Create a file under `src/services/`.
2. Extend `BaseService` and implement `information()` (returns `ServiceInformation`) and `collect()` (returns `Promise<CollectResult>`).
3. Fetch with the built-in `fetch`; parse HTML with `cheerio` or feeds with `fast-xml-parser`. Use `fetchArticleWithCache` from `@/utils/article-fetcher` when fetching article HTML.
4. Register the class in the `services` array in `src/main.ts`.
5. Log via `Logger.configure(\`${this.constructor.name}.<method>\`)`.

Example skeleton:

```typescript
import { BaseService } from '@/base-service'
import CollectResult, { Item } from '@/model/collect-result'
import ServiceInformation from '@/model/service-information'
import { Logger } from '@book000/node-utils'
import * as cheerio from 'cheerio'

export default class NewRssService extends BaseService {
  information(): ServiceInformation {
    return { title: 'サービス名', link: 'https://example.com', description: '説明' }
  }

  async collect(): Promise<CollectResult> {
    const logger = Logger.configure(`${this.constructor.name}.collect`)
    try {
      const res = await fetch('https://example.com/feed')
      const $ = cheerio.load(await res.text())
      const items: Item[] = []
      // parse into items...
      return { status: true, items }
    } catch (error) {
      logger.error('Failed to collect RSS feed', error as Error)
      return { status: false, items: [] }
    }
  }
}
```

### pubDate handling

`BaseService.processPubDates()` runs automatically from `main.ts`. When an item has no `pubDate` it inherits from the previous feed, then from the deleted-articles history, and finally falls back to the current time. Individual services do not need to handle this.

### Deleted-article tracking

`utils/deleted-articles-tracker.ts` detects and persists deleted articles to a JSON history automatically. Services need no special handling.

## Testing

No test framework is currently set up. Verify changes by running `pnpm lint` (type-check + lint) and `pnpm start` (confirm the RSS XML is generated and deletions are tracked correctly).

## Documentation update rules

When you change development commands (`package.json` scripts), the tech stack, or project requirements, update both agent-facing docs so they stay in sync:

- `CLAUDE.md` (this file)
- `.github/copilot-instructions.md`

## Repository-specific rules

- **pnpm only**: the `preinstall` script runs `only-allow pnpm`; npm/yarn are rejected.
- **Native binaries**: `canvas` and `sharp` build only for supported architectures (see the `pnpm.supportedArchitectures` field in `package.json`).
- **CI**: GitHub Actions (`nodejs-ci-pnpm.yml`) runs lint/type-check; CI must pass before merging to `master`. Node.js version comes from `.node-version`.

## Security

- Never commit API keys, credentials, or other secrets. Manage secrets via environment variables.
- Never log personal information or credentials.
