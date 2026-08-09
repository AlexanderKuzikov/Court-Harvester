# Court-Harvester — Instructions for AI Agents

## Commands
- start: `npm start`
- build: `npm run build`
- test: `npm test`
- format: `npm run format`
- update: `npm run update`
- update:full: `npm run update:full`
- harvest:59: `npm run harvest:59`

## Conventions
- TypeScript 7, ESM, Node 24+, tsx для запуска
- API-first: только DaData, без HTML-скрапинга
- «Умный брутфорс» — многоуровневое расширение префиксов
- Ротация ключей (KeyRotationManager, до 4 ключей)
- Rate limiting: Bottleneck 20 req/s
- Чекпоинты каждые 100-200 запросов

## Structure
- `src/index.ts` — CLI entry (commander)
- `src/core/ApiClient.ts` — HTTP + rate limiter + retry
- `src/core/FullHarvester.ts` — полный сбор (prefix brute-force)
- `src/core/KeyRotationManager.ts` — ротация ключей
- `src/core/RegionHarvester.ts` — сбор по региону
- `src/examples/` — операционные скрипты (update, phases)
- `src/types/dadata.ts` — типы DaData API
- `data/` — JSON базы, чекпоинты, Excel
- `keys/` — API-ключи (gitignored)

## Do NOT touch
- `keys/` — API-ключи
- `.env` — секреты
- `data/` — выходные данные
- `node_modules/`

## Documentation rules
- После работы — обнови docs/CONTEXT.md
- Если принял архитектурное решение — запиши в docs/DECISIONS.md
- НЕ создавай новых файлов документации без разрешения
- Переиспользуемые знания — в D:\GitHub\knowledge/README.md
