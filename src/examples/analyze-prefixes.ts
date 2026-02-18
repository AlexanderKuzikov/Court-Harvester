import { promises as fs } from 'fs';
import path from 'path';

interface Court {
  code: string;
  [key: string]: any;
}

async function main() {
  const data = JSON.parse(await fs.readFile(
    path.join(process.cwd(), 'data', 'courts_full_phase9b.json'), 'utf-8'
  ));
  const courts: Court[] = data.courts;

  // Собираем статистику по префиксам
  const byPrefix = new Map<string, number[]>();
  for (const court of courts) {
    const prefix = court.code.substring(0, 4);
    const num = parseInt(court.code.substring(4), 10);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(num);
  }

  const prefixStats = Array.from(byPrefix.entries()).map(([prefix, nums]) => ({
    prefix,
    count: nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    gaps: Math.max(...nums) - Math.min(...nums) + 1 - nums.length,
  }));

  const EMPTY_LIMIT = 20;
  const TAIL_CHECK = 200;
  const NEW_TERRITORY_REGIONS = 10; // 90-99
  const NEW_TERRITORY_TYPES = 14;

  // 1. Хвосты: по опыту фазы 9B всегда останавливается на EMPTY_LIMIT
  const tailMin = prefixStats.length * EMPTY_LIMIT;
  const tailMax = prefixStats.length * TAIL_CHECK;

  // 2. Новые территории: широкий поиск по префиксам
  const newTerritoryRequests = NEW_TERRITORY_REGIONS * NEW_TERRITORY_TYPES;

  // 3. Дырки: только префиксы где gaps > 0
  const prefixesWithGaps = prefixStats.filter(p => p.gaps > 0);
  const gapRequests = prefixesWithGaps.reduce((sum, p) => sum + p.gaps, 0);

  // 4. Обновление существующих: 1 запрос на суд
  const updateRequests = courts.length;

  console.log('\n📊 Анализ префиксов базы\n');
  console.log(`Всего префиксов: ${prefixStats.length}`);
  console.log(`Всего судов: ${courts.length}\n`);

  console.log('📋 Распределение по MAX:');
  console.log(`  MAX = 0:      ${prefixStats.filter(p => p.max === 0).length} префиксов`);
  console.log(`  MAX 1-10:     ${prefixStats.filter(p => p.max >= 1 && p.max <= 10).length} префиксов`);
  console.log(`  MAX 11-50:    ${prefixStats.filter(p => p.max >= 11 && p.max <= 50).length} префиксов`);
  console.log(`  MAX 51-100:   ${prefixStats.filter(p => p.max >= 51 && p.max <= 100).length} префиксов`);
  console.log(`  MAX > 100:    ${prefixStats.filter(p => p.max > 100).length} префиксов`);

  console.log('\n🔍 Оценка запросов для скрипта обновления:\n');

  console.log(`1️⃣  Хвосты (MAX+1 до MAX+200, стоп при ${EMPTY_LIMIT} пустых подряд):`);
  console.log(`    Префиксов: ${prefixStats.length}`);
  console.log(`    Минимум (все пустые): ~${tailMin} запросов`);
  console.log(`    Максимум (все полные): ~${tailMax} запросов`);
  console.log(`    Реалистично: ~${tailMin} запросов (по опыту фазы 9B)\n`);

  console.log(`2️⃣  Новые территории 90-99 (широкий поиск):`);
  console.log(`    Запросов: ~${newTerritoryRequests}\n`);

  console.log(`3️⃣  Дырки (пропуски внутри MIN-MAX):`);
  console.log(`    Префиксов с пропусками: ${prefixesWithGaps.length}`);
  console.log(`    Запросов: ~${gapRequests}\n`);

  console.log(`4️⃣  Обновление существующих судов (адреса, закрытия, переименования):`);
  console.log(`    Судов в базе: ${courts.length}`);
  console.log(`    Запросов: ~${updateRequests}`);
  console.log(`    Рекомендуется: раз в 3-6 месяцев\n`);

  const minTotal = tailMin + newTerritoryRequests;
  const maxTotal = tailMax + newTerritoryRequests + gapRequests;
  const realisticSearch = tailMin + newTerritoryRequests + Math.min(gapRequests, 500);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 ИТОГО (только поиск новых судов):`);
  console.log(`    Минимум (все пустые): ~${minTotal} запросов`);
  console.log(`    Максимум (всё найдено): ~${maxTotal} запросов`);
  console.log(`    Реалистично: ~${realisticSearch} запросов`);
  console.log(`\n📊 ИТОГО (поиск + обновление существующих):`);
  console.log(`    Реалистично: ~${realisticSearch + updateRequests} запросов`);
  console.log(`    Укладывается в дневной лимит (10,000): ${realisticSearch + updateRequests <= 10000 ? '✅ ДА' : '❌ НЕТ, нужно разбить на 2 дня'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('💡 Рекомендуемый план обновлений:');
  console.log(`    📅 Раз в месяц:  Поиск новых судов (~${realisticSearch} запросов)`);
  console.log(`    📅 Раз в квартал: Поиск новых + обновление существующих (~${realisticSearch + updateRequests} запросов)`);
}

main().catch(console.error);
