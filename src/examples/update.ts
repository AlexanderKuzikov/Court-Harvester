import 'dotenv/config';
import { KeyRotationManager } from '../core/KeyRotationManager';
import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

interface Court {
  code: string;
  name: string;
  [key: string]: any;
}

interface CourtWithStatus extends Court {
  _status: 'existing' | 'new' | 'updated' | 'not_found';
  _updatedAt?: string;
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
const TAIL_CHECK = 200;
const SAVE_INTERVAL = 200;
const LOG_INTERVAL = 100;
const TODAY = new Date().toISOString().slice(0, 10);

let logBuffer: string[] = [];
const logPath = path.join(process.cwd(), 'data', `update_${TODAY}_log.txt`);

function log(message: string) {
  console.log(message);
  logBuffer.push(`[${new Date().toISOString()}] ${message}`);
}

async function flushLog() {
  if (logBuffer.length === 0) return;
  await fs.appendFile(logPath, logBuffer.join('\n') + '\n', 'utf-8');
  logBuffer = [];
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function getPrefixStats(courtsMap: Map<string, CourtWithStatus>, prefix: string): PrefixStats | null {
  const nums = Array.from(courtsMap.values())
    .filter(c => c.code.startsWith(prefix))
    .map(c => parseInt(c.code.substring(4), 10));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), count: nums.length };
}

function getAllPrefixes(courtsMap: Map<string, CourtWithStatus>): string[] {
  const prefixes = new Set<string>();
  for (const court of courtsMap.values()) {
    prefixes.add(court.code.substring(0, 4));
  }
  return Array.from(prefixes).sort();
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const mode = process.argv[2] ?? 'search'; // search | full

  await fs.writeFile(logPath, '', 'utf-8');

  log(`\n🌐 Court-Harvester – Обновление базы`);
  log(`📋 Режим: ${mode === 'full' ? 'ПОЛНЫЙ (поиск + обновление существующих)' : 'ПОИСК НОВЫХ судов'}`);
  log(`📅 Дата: ${new Date().toLocaleString('ru-RU')}\n`);

  // Инициализация менеджера ключей
  const keyManager = new KeyRotationManager();
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env']);

  // Загружаем базу
  const dbPath = path.join(process.cwd(), 'data', 'courts_full_phase9b.json');
  const data: DatabaseFile = JSON.parse(await fs.readFile(dbPath, 'utf-8'));

  // courtsMap хранит суды со статусом
  const courtsMap = new Map<string, CourtWithStatus>(
    data.courts.map(c => [c.code, { ...c, _status: 'existing' }])
  );

  const initialCount = courtsMap.size;
  log(`✅ Загружено судов: ${initialCount}\n`);
  await flushLog();

  let keysOk = true;
  let totalRequests = 0;
  let lastSave = 0;
  let foundTotal = 0;
  let updatedTotal = 0;
  let notFoundTotal = 0;

  // Вспомогательная функция запроса с ротацией ключей
  async function suggestCourt(query: string, count = 1): Promise<any> {
    try {
      const resp = await keyManager.getClient().suggestCourt(query, { count });
      keysOk = await keyManager.trackRequest();
      totalRequests++;
      return resp;
    } catch (e: any) {
      if (e.message?.includes('quota') || e.message?.includes('disabled')) {
        log(`\n⚠️ Квота API исчерпана`);
        keysOk = await keyManager.trackRequest();
      }
      return { suggestions: [] };
    }
  }

  async function autosave() {
    if (totalRequests - lastSave >= SAVE_INTERVAL) {
      await saveProgress();
      await flushLog();
      lastSave = totalRequests;
    }
  }

  // ============================================================
  // ШАГ 1: ХВОСТЫ
  // ============================================================

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('🔍 ШАГ 1: Хвосты (MAX+1 до MAX+200)');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allPrefixes = getAllPrefixes(courtsMap);
  log(`📋 Префиксов: ${allPrefixes.length}\n`);

  let processedPrefixes = 0;

  for (const prefix of allPrefixes) {
    if (!keysOk) break;

    const stats = getPrefixStats(courtsMap, prefix);
    if (!stats) continue;

    processedPrefixes++;

    let consecutive = 0;
    let foundInTail = 0;
    let currentNum = stats.max + 1;

    while (currentNum <= stats.max + TAIL_CHECK && consecutive < EMPTY_LIMIT && keysOk) {
      const code = `${prefix}${String(currentNum).padStart(4, '0')}`;
      const resp = await suggestCourt(code, 1);

      if (totalRequests % LOG_INTERVAL === 0) {
        const s = keyManager.getStats();
        log(`  📊 Запросов: ${totalRequests} | Ключ: ${s.currentKey} (${s.currentKeyRequests}) | Найдено: ${foundTotal}`);
      }

      if (resp.suggestions.length > 0) {
        const court = resp.suggestions[0].data;
        if (!courtsMap.has(court.code)) {
          courtsMap.set(court.code, { ...court, _status: 'new', _updatedAt: TODAY });
          foundInTail++;
          foundTotal++;
          consecutive = 0;
          log(`  ✅ НОВЫЙ: ${court.code}: ${court.name}`);
        } else {
          consecutive++;
        }
      } else {
        consecutive++;
      }

      currentNum++;
      await autosave();
      await new Promise(r => setTimeout(r, 20));
    }

    if (foundInTail > 0) {
      log(`📋 ${prefix} (MAX=${stats.max}): найдено ${foundInTail} в хвосте`);
    }
  }

  log(`\n✅ Шаг 1 завершен. Найдено новых: ${foundTotal}, обработано префиксов: ${processedPrefixes}`);

  // ============================================================
  // ШАГ 2: НОВЫЕ ТЕРРИТОРИИ 90-99
  // ============================================================

  if (keysOk) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🔍 ШАГ 2: Новые территории (регионы 90-99)');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const newRegions = ['90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
    const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];
    let foundInNewTerritories = 0;

    for (const region of newRegions) {
      if (!keysOk) break;
      for (const type of types) {
        if (!keysOk) break;

        const resp = await suggestCourt(`${region}${type}`, 20);

        for (const suggestion of resp.suggestions) {
          const court = suggestion.data;
          if (court.code.startsWith(region) && !courtsMap.has(court.code)) {
            courtsMap.set(court.code, { ...court, _status: 'new', _updatedAt: TODAY });
            foundInNewTerritories++;
            foundTotal++;
            log(`  ✅ НОВЫЙ: ${court.code}: ${court.name}`);
          }
        }

        await autosave();
        await new Promise(r => setTimeout(r, 20));
      }
    }

    log(`\n✅ Шаг 2 завершен. Найдено новых: ${foundInNewTerritories}`);
  }

  // ============================================================
  // ШАГ 3: ДЫРКИ (от 0000 до MAX)
  // ============================================================

  if (keysOk) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🔍 ШАГ 3: Дырки (пропуски от 0000 до MAX)');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let foundInGaps = 0;

    for (const prefix of allPrefixes) {
      if (!keysOk) break;

      const stats = getPrefixStats(courtsMap, prefix);
      if (!stats) continue;

      for (let num = 0; num <= stats.max && keysOk; num++) {
        const code = `${prefix}${String(num).padStart(4, '0')}`;
        if (courtsMap.has(code)) continue;

        const resp = await suggestCourt(code, 1);

        if (resp.suggestions.length > 0) {
          const court = resp.suggestions[0].data;
          if (!courtsMap.has(court.code)) {
            courtsMap.set(court.code, { ...court, _status: 'new', _updatedAt: TODAY });
            foundInGaps++;
            foundTotal++;
            log(`  ✅ НОВЫЙ: ${court.code}: ${court.name}`);
          }
        }

        await autosave();
        await new Promise(r => setTimeout(r, 20));
      }
    }

    log(`\n✅ Шаг 3 завершен. Найдено новых: ${foundInGaps}`);
  }

  // ============================================================
  // ШАГ 4: ОБНОВЛЕНИЕ СУЩЕСТВУЮЩИХ (только full)
  // ============================================================

  if (mode === 'full' && keysOk) {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🔍 ШАГ 4: Обновление существующих судов');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Обновляем только те, что были 'existing' (не новые)
    const existingCourts = Array.from(courtsMap.values()).filter(c => c._status === 'existing');
    let processedCourts = 0;

    for (const court of existingCourts) {
      if (!keysOk) break;

      const resp = await suggestCourt(court.code, 1);
      processedCourts++;

      if (resp.suggestions.length > 0) {
        const updated = resp.suggestions[0].data;
        const { _status, _updatedAt, ...oldData } = court;
        const hasChanges = JSON.stringify(updated) !== JSON.stringify(oldData);

        if (hasChanges) {
          courtsMap.set(updated.code, { ...updated, _status: 'updated', _updatedAt: TODAY });
          updatedTotal++;
          log(`  🔄 ОБНОВЛЕН: ${updated.code}: ${updated.name}`);
        }
      } else {
        // Суд не найден — возможно закрыт
        courtsMap.set(court.code, { ...court, _status: 'not_found', _updatedAt: TODAY });
        notFoundTotal++;
        log(`  ⚠️ НЕ НАЙДЕН (закрыт?): ${court.code}: ${court.name}`);
      }

      if (processedCourts % LOG_INTERVAL === 0) {
        const s = keyManager.getStats();
        log(`  📊 Обновлено: ${processedCourts}/${existingCourts.length} | Изменений: ${updatedTotal} | Ключ: ${s.currentKey}`);
      }

      await autosave();
      await new Promise(r => setTimeout(r, 20));
    }

    log(`\n✅ Шаг 4 завершен. Обновлено: ${updatedTotal}, не найдено: ${notFoundTotal}`);
  }

  // ============================================================
  // ФИНАЛЬНОЕ СОХРАНЕНИЕ
  // ============================================================

  await saveProgress(true);

  async function saveProgress(isFinal = false) {
    // Сортируем по code
    const sortedCourts = Array.from(courtsMap.values())
      .sort((a, b) => a.code.localeCompare(b.code));

    // 1. Сохраняем JSON (без служебных полей _status, _updatedAt)
    const cleanCourts = sortedCourts.map(({ _status, _updatedAt, ...court }) => court);

    const output: DatabaseFile = {
      meta: {
        totalCourts: cleanCourts.length,
        timestamp: new Date().toISOString(),
        phase: isFinal ? `update-${TODAY}` : 'update-progress',
        mode,
        found: foundTotal,
        updated: updatedTotal,
        notFound: notFoundTotal,
      },
      courts: cleanCourts,
    };

    const jsonFilename = isFinal
      ? `courts_updated_${TODAY}.json`
      : 'courts_update_progress.json';

    await fs.writeFile(
      path.join(process.cwd(), 'data', jsonFilename),
      JSON.stringify(output, null, 2),
      'utf-8'
    );

    if (isFinal) {
      log(`\n💾 JSON сохранён: data/${jsonFilename}`);
    }

    // 2. Сохраняем Excel с пометками
    if (isFinal) {
      const excelData = sortedCourts.map(court => {
        const { _status, _updatedAt, ...fields } = court;
        return {
          status: _status,
          updated_at: _updatedAt ?? '',
          ...fields,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Автоширина колонок
      const cols = Object.keys(excelData[0] || {}).map(key => ({
        wch: Math.min(
          Math.max(key.length, ...excelData.map(r => String((r as any)[key] ?? '').length)) + 2,
          50
        ),
      }));
      worksheet['!cols'] = cols;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Courts');

      // Второй лист: только изменения
      const changedCourts = sortedCourts.filter(c => c._status !== 'existing');
      if (changedCourts.length > 0) {
        const changesData = changedCourts.map(court => {
          const { _status, _updatedAt, ...fields } = court;
          return { status: _status, updated_at: _updatedAt ?? '', ...fields };
        });
        const changesSheet = XLSX.utils.json_to_sheet(changesData);
        XLSX.utils.book_append_sheet(workbook, changesSheet, 'Changes');
        log(`📊 Лист "Changes": ${changedCourts.length} изменений`);
      }

      const excelPath = path.join(process.cwd(), 'data', `courts_updated_${TODAY}.xlsx`);
      XLSX.writeFile(workbook, excelPath);
      log(`📊 Excel сохранён: data/courts_updated_${TODAY}.xlsx`);
    }

    // ============================================================
    // ИТОГИ
    // ============================================================

    if (isFinal) {
      const stats = keyManager.getStats();
      log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('📈 ИТОГИ ОБНОВЛЕНИЯ:');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log(`  Было судов:              ${initialCount}`);
      log(`  Найдено новых:           ${foundTotal}`);
      log(`  Обновлено существующих:  ${updatedTotal}`);
      log(`  Не найдено (закрыты?):   ${notFoundTotal}`);
      log(`  Стало судов:             ${courtsMap.size}`);
      log(`  Всего запросов:          ${totalRequests}`);
      log(`  Использовано ключей:     ${stats.keysUsed}`);
      log(`  Осталось ключей:         ${stats.keysRemaining}`);
      log(`  Лог:                     ${logPath}`);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      await keyManager.shutdown();
      await flushLog();
    }
  }
}

main().catch(console.error);
