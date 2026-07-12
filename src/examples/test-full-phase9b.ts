import '../env';
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

const EMPTY_LIMIT = 20;
const MAX_TAIL_CHECK = 200;
const SAVE_INTERVAL = 100;

// Логирование
let logBuffer: string[] = [];
const logPath = path.join(process.cwd(), 'data', 'phase9b_log.txt');

function log(message: string) {
  console.log(message);
  logBuffer.push(`[${new Date().toISOString()}] ${message}`);
}

async function saveLog() {
  await fs.appendFile(logPath, logBuffer.join('\n') + '\n', 'utf-8');
  logBuffer = [];
}

async function main() {
  // Очищаем лог-файл
  await fs.writeFile(logPath, '', 'utf-8');
  
  log('\n🌐 Court-Harvester – Фаза 9B (хвосты топ-20 регионов)\n');

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const dbPath = path.join(process.cwd(), 'data', 'courts_full_phase8.json');
  const data: DatabaseFile = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
  const courtsMap = new Map<string, Court>(data.courts.map(c => [c.code, c]));

  log(`✅ Загружено судов: ${courtsMap.size}`);
  log(`🔍 Лимит пустых подряд: ${EMPTY_LIMIT}`);
  log(`📏 Проверка до MAX+${MAX_TAIL_CHECK}`);
  log(`💾 Автосохранение каждые ${SAVE_INTERVAL} запросов`);
  log(`📝 Логи сохраняются в: ${logPath}\n`);

  const initialCount = courtsMap.size;
  let totalRequests = 0;
  let lastSaveRequests = 0;

  // Топ-20 регионов
  const top20Regions = ['77', '50', '23', '61', '66', '03', '78', '16', '74', '24', 
                        '52', '22', '63', '42', '34', '26', '59', '54', '05', '38'];

  // Получаем префиксы топ-20 регионов
  const allPrefixes = getAllPrefixes(courtsMap);
  const top20Prefixes = allPrefixes
    .filter(prefix => top20Regions.includes(prefix.substring(0, 2)))
    .map(prefix => {
      const stats = getPrefixStats(courtsMap, prefix);
      return stats ? { prefix, stats } : null;
    })
    .filter((p): p is { prefix: string; stats: PrefixStats } => p !== null && p.stats.max > 50)
    .sort((a, b) => b.stats.max - a.stats.max);

  log(`📋 Найдено префиксов топ-20 регионов с MAX > 50: ${top20Prefixes.length}`);
  
  const estimatedRequests = top20Prefixes.length * EMPTY_LIMIT;
  log(`📊 Минимальная оценка запросов: ~${estimatedRequests}\n`);

  await saveLog();

  let processedPrefixes = 0;
  let foundTotal = 0;

  for (const { prefix, stats } of top20Prefixes) {
    processedPrefixes++;
    log(`\n📋 [${processedPrefixes}/${top20Prefixes.length}] ${prefix} (MAX=${stats.max}): проверка хвостов`);

    let consecutive = 0;
    let foundInExtended = 0;
    let currentNum = stats.max + 1;

    while (currentNum <= stats.max + MAX_TAIL_CHECK && consecutive < EMPTY_LIMIT) {
      const code = `${prefix}${String(currentNum).padStart(4, '0')}`;
      totalRequests++;

      if (totalRequests % 100 === 0) {
        log(`  📊 Запросов: ${totalRequests}, найдено всего: ${foundTotal}`);
      }

      // Автосохранение
      if (totalRequests - lastSaveRequests >= SAVE_INTERVAL) {
        await saveProgress(courtsMap, totalRequests, foundTotal, processedPrefixes, top20Prefixes.length);
        await saveLog();
        lastSaveRequests = totalRequests;
      }

      try {
        const resp = await apiClient.suggestCourt(code, { count: 1 });
        
        if (resp.suggestions.length > 0) {
          const court = resp.suggestions[0].data;
          if (!courtsMap.has(court.code)) {
            courtsMap.set(court.code, court);
            foundInExtended++;
            foundTotal++;
            consecutive = 0;
            log(`  ✅ ${court.code}: ${court.name}`);
          } else {
            consecutive++;
          }
        } else {
          consecutive++;
        }
      } catch (e: any) {
        if (e.message?.includes('quota') || e.message?.includes('disabled')) {
          log(`\n⚠️  Лимит API исчерпан на запросе ${totalRequests}`);
          log(`📊 Обработано ${processedPrefixes}/${top20Prefixes.length} префиксов`);
          await saveLog();
          await saveAndExit();
          return;
        }
        consecutive++;
      }

      currentNum++;
      await new Promise(r => setTimeout(r, 20));
    }

    if (foundInExtended > 0) {
      log(`  ✅ Найдено в расширенном хвосте: ${foundInExtended}`);
    } else {
      log(`  ⭕ Ничего не найдено (${consecutive} пустых подряд)`);
    }

    await saveLog();
  }

  await saveAndExit();

  async function saveProgress(
    map: Map<string, Court>,
    requests: number,
    found: number,
    processed: number,
    total: number
  ) {
    const progressPath = path.join(process.cwd(), 'data', 'courts_phase9b_progress.json');
    const output: DatabaseFile = {
      meta: {
        totalCourts: map.size,
        timestamp: new Date().toISOString(),
        phase: 'phase9b-progress',
        requests,
        found,
        processedPrefixes: processed,
        totalPrefixes: total,
      },
      courts: Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)),
    };
    await fs.writeFile(progressPath, JSON.stringify(output, null, 2), 'utf-8');
    log(`  💾 Прогресс сохранен (${requests} запросов)`);
  }

  async function saveAndExit() {
    const finalCount = courtsMap.size;
    
    log('\n\n📈 Итоги Фазы 9B:');
    log(`  Было судов: ${initialCount}`);
    log(`  Добавлено: ${finalCount - initialCount}`);
    log(`  Стало судов: ${finalCount}`);
    log(`  Всего запросов: ${totalRequests}`);
    log(`  Обработано префиксов: ${processedPrefixes}/${top20Prefixes.length}`);

    await saveLog();
    await apiClient.shutdown();

    const output: DatabaseFile = {
      meta: {
        totalCourts: courtsMap.size,
        timestamp: new Date().toISOString(),
        phase: 'phase9b',
        completed: processedPrefixes === top20Prefixes.length,
      },
      courts: Array.from(courtsMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    };

    const outputPath = path.join(process.cwd(), 'data', 'courts_full_phase9b.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    
    log('\n✅ Фаза 9B завершена\n');
    log(`💾 Итоги сохранены в ${outputPath}`);
    log(`📝 Полный лог: ${logPath}`);
    
    await saveLog();
  }
}

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
