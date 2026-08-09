<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 24" src="https://img.shields.io/badge/Node-24+-339933?logo=node.js&logoColor=white"></a>
  <a href="https://dadata.ru"><img alt="DaData" src="https://img.shields.io/badge/API-DaData-FF6F00?logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
</p>

<h1 align="center">Court-Harvester</h1>
<p align="center">Справочник судов РФ через DaData API — 10 206 судов, 96 регионов, 14 типов</p>

---

CLI-утилита для сбора и поддержания эталонного справочника судов Российской Федерации. Использует DaData suggestions API с многоуровневым брутфорсом префиксов, ротацией ключей и чекпоинтами.

- **10 206 судов** — 96 регионов, 14 типов (MS, RS, GV, AS, OS, AA, KJ...)
- **Умный брутфорс** — расширение префиксов: 1 → 2 → 3 буквы
- **Ротация ключей** — до 4 ключей × 9500 запросов/день
- **Rate limiting** — Bottleneck 20 req/s с reservoir
- **Чекпоинты** — автосохранение каждые 100-200 запросов
- **Excel-экспорт** — xlsx (SheetJS)
- **Инкрементальное обновление** — monthly (~30 мин) / quarterly (~60 мин)

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/Court-Harvester.git
cd Court-Harvester
npm install
cp .env.example .env   # DADATA_API_KEY, DADATA_SECRET_KEY

npm run start          # CLI (commander)
npm run update         # monthly: tails + territories + gaps
npm run update:full    # quarterly: + revalidation всех 10206
```

## Документация

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние проекта
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — архитектурные решения

## Статус

**v0.2.0** — база собрана (февраль 2026, 7 фаз). Инкрементальное обновление работает.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov
