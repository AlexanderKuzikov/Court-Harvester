import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';
import { promises as fs } from 'fs';
import path from 'path';

interface Court {
  code: string;
  name: string;
  region_code?: string;
  okato?: string;
  okpo?: string;
  region_with_type?: string;
  [key: string]: any;
}

interface DatabaseFile {
  meta: any;
  courts: Court[];
}

interface PrefixStats {
  min: number;
  max: number;
  count: number;
}

async function main() {
  console.log('\n🌐 Court-Harvester – Фаза 8 (новые территории 90-99 + расширенные хвосты)\n');

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const dbPath = path.join(process.cwd(), 'data', 'courts_full_final_sorted.json');
  const data: DatabaseFile = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
  const courtsMap = new Map<string, Court>(data.courts.map(c => [c.code, c]));

  console.log(`✅ Загружено судов: ${courtsMap.size}\n`);

  const initialCount = courtsMap.size;
  let totalRequests = 0;

  // ============================================================
  // ЧАСТЬ 1: Регионы 90-99
  // ============================================================
  console.log('📍 ЧАСТЬ 1: Регионы 90-99 (новые территории)\n');

  const newRegions = ['90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];

  // Шаг 1.1: Широкий поиск по префиксам
  console.log('🔍 Шаг 1.1: Широкий поиск по префиксам...\n');
  
  const foundPrefixes = new Set<string>();
  
  for (const region of newRegions) {
    for (const type of types) {
      const query = `${region}${type}`;
      totalRequests++;

      try {
        const resp = await apiClient.suggestCourt(query, { count: 20 });
        
        for (const suggestion of resp.suggestions) {
          const court = suggestion.data;
          if (court.code.startsWith(region)) {
            const prefix = court.code.substring(0, 4); // RRTT
            foundPrefixes.add(prefix);
            
            if (!courtsMap.has(court.code)) {
              courtsMap.set(court.code, court);
              console.log(`✅ ${court.code}: ${court.name}`);
            }
          }
        }
      } catch (e: any) {
        if (e.message?.includes('quota') || e.message?.includes('disabled')) {
          console.log(`\n⚠️  Лимит API на запросе ${totalRequests}`);
          await saveAndExit();
          return;
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }
  }

  console.log(`\n📊 Найдено префиксов: ${foundPrefixes.size}`);
  console.log(`📊 Судов после широкого поиска: ${courtsMap.size}\n`);

  // Шаг 1.2: Проверка 0000-MAX для найденных префиксов
  console.log('🔍 Шаг 1.2: Проверка 0000-MAX для найденных префиксов...\n');

  for (const prefix of Array.from(foundPrefixes).sort()) {
    const stats = getPrefixStats(courtsMap, prefix);
    if (!stats) continue;

    console.log(`\n📋 ${prefix}: проверка 0000-${String(stats.max).padStart(4, '0')}`);

    let foundInRange = 0;
    
    for (let num = 0; num <= stats.max; num++) {
      const code = `${prefix}${String(num).padStart(4, '0')}`;
      
      if (courtsMap.has(code)) continue; // Уже есть
      
      totalRequests++;

      try {
        const resp = await apiClient.suggestCourt(code, { count: 1 });
        
        if (resp.suggestions.length > 0) {
          const court = resp.suggestions[0].data;
          if (!courtsMap.has(court.code)) {
            courtsMap.set(court.code, court);
            foundInRange++;
            console.log(`  ✅ ${court.code}`);
          }
        }
      } catch (e: any) {
        if (e.message?.includes('quota') || e.message?.includes('disabled')) {
          console.log(`\n⚠️  Лимит API на запросе ${totalRequests}`);
          await saveAndExit();
          return;
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }

    console.log(`  Найдено: ${foundInRange}`);
  }

  console.log(`\n📊 Судов после проверки 0000-MAX: ${courtsMap.size}\n`);

  // Шаг 1.3: Хвосты MAX+100
  console.log('🔍 Шаг 1.3: Хвосты MAX+100...\n');

  for (const prefix of Array.from(foundPrefixes).sort()) {
    const stats = getPrefixStats(courtsMap, prefix);
    if (!stats) continue;

    let consecutive = 0;
    let foundInTail = 0;

    for (let num = stats.max + 1; num <= stats.max + 100; num++) {
      const code = `${prefix}${String(num).padStart(4, '0')}`;
      totalRequests++;

      try {
        const resp = await apiClient.suggestCourt(code, { count: 1 });
        
        if (resp.suggestions.length > 0) {
          const court = resp.suggestions[0].data;
          if (!courtsMap.has(court.code)) {
            courtsMap.set(court.code, court);
            foundInTail++;
            consecutive = 0;
            console.log(`  ✅ ${court.code}`);
          }
        } else {
          consecutive++;
          if (consecutive >= 5) break; // 5 подряд не найдено
        }
      } catch (e: any) {
        if (e.message?.includes('quota') || e.message?.includes('disabled')) {
          console.log(`\n⚠️  Лимит API на запросе ${totalRequests}`);
          await saveAndExit();
          return;
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }

    if (foundInTail > 0) {
      console.log(`📋 ${prefix}: найдено ${foundInTail} в хвосте`);
    }
  }

  const afterNewRegions = courtsMap.size;
  console.log(`\n📊 Судов после регионов 90-99: ${afterNewRegions} (+${afterNewRegions - initialCount})\n`);

  // ============================================================
  // ЧАСТЬ 2: Расширенные хвосты MAX+200 (крупные префиксы)
  // ============================================================
  console.log('\n📍 ЧАСТЬ 2: Расширенные хвосты MAX+200 для крупных префиксов\n');

  // Анализируем все префиксы
  const allPrefixes = getAllPrefixes(courtsMap);
  const largePrefixes = allPrefixes
    .map(prefix => {
      const stats = getPrefixStats(courtsMap, prefix);
      return stats ? { prefix, stats } : null;
    })
    .filter((p): p is { prefix: string; stats: PrefixStats } => p !== null && p.stats.max > 100)
    .sort((a, b) => b.stats.max - a.stats.max)
    .slice(0, 30); // Топ-30

  console.log(`📋 Проверяем топ-30 префиксов с MAX > 100\n`);

  for (const { prefix, stats } of largePrefixes) {
    console.log(`\n📋 ${prefix} (MAX=${stats.max}): проверка MAX+51 до MAX+200`);

    let consecutive = 0;
    let foundInExtended = 0;

    for (let num = stats.max + 51; num <= stats.max + 200; num++) {
      const code = `${prefix}${String(num).padStart(4, '0')}`;
      totalRequests++;

      try {
        const resp = await apiClient.suggestCourt(code, { count: 1 });
        
        if (resp.suggestions.length > 0) {
          const court = resp.suggestions[0].data;
          if (!courtsMap.has(court.code)) {
            courtsMap.set(court.code, court);
            foundInExtended++;
            consecutive = 0;
            console.log(`  ✅ ${court.code}`);
          }
        } else {
          consecutive++;
          if (consecutive >= 10) break; // 10 подряд не найдено
        }
      } catch (e: any) {
        if (e.message?.includes('quota') || e.message?.includes('disabled')) {
          console.log(`\n⚠️  Лимит API на запросе ${totalRequests}`);
          await saveAndExit();
          return;
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }

    if (foundInExtended > 0) {
      console.log(`  Найдено: ${foundInExtended}`);
    }
  }

  // ============================================================
  // ИТОГИ
  // ============================================================
  await saveAndExit();

  async function saveAndExit() {
    const finalCount = courtsMap.size;
    
    console.log('\n📈 Итоги Фазы 8:');
    console.log(`  Было судов: ${initialCount}`);
    console.log(`  Добавлено: ${finalCount - initialCount}`);
    console.log(`  Стало судов: ${finalCount}`);
    console.log(`  Всего запросов: ${totalRequests}`);

    await apiClient.shutdown();

    console.log('\n✅ Фаза 8 завершена\n');

    const output: DatabaseFile = {
      meta: {
        totalCourts: courtsMap.size,
        timestamp: new Date().toISOString(),
        phase: 'phase8',
      },
      courts: Array.from(courtsMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    };

    const outputPath = path.join(process.cwd(), 'data', 'courts_full_phase8.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 Итоги сохранены в ${outputPath}`);
  }
}

// Вспомогательные функции
function getPrefixStats(courtsMap: Map<string, Court>, prefix: string): PrefixStats | null {
  const courts = Array.from(courtsMap.values()).filter(c => c.code.startsWith(prefix));
  if (courts.length === 0) return null;

  const numbers = courts.map(c => parseInt(c.code.substring(4), 10));
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    count: courts.length,
  };
}

function getAllPrefixes(courtsMap: Map<string, Court>): string[] {
  const prefixes = new Set<string>();
  for (const court of courtsMap.values()) {
    prefixes.add(court.code.substring(0, 4));
  }
  return Array.from(prefixes);
}

main().catch(console.error);
