import { promises as fs } from 'fs';
import path from 'path';
import { KeyRotationManager } from '../core/KeyRotationManager';

const OUT_PATH = path.join(process.cwd(), 'data', 'bootstrap-test.json');
const LOG_PATH = path.join(process.cwd(), 'data', 'bootstrap-test.log');
const DELAY_MS = 20;
const COUNT    = 20;

const ALL_TYPES = ['RS','MS','AS','OS','GV','OV','KV','AV','KJ','AJ','AA','AO','VS','AI'];

// Типы у которых заведомо >20 судов на регион — всегда перебираем по регионам
const ALWAYS_ENUMERATE = ['RS', 'MS'];

function pad(n: number) { return String(n).padStart(4, '0'); }

async function main() {
  let logBuf: string[] = [];
  await fs.writeFile(LOG_PATH, '', 'utf-8');

  async function log(msg: string) {
    console.log(msg);
    logBuf.push(new Date().toISOString() + ' ' + msg);
  }
  async function flushLog() {
    if (!logBuf.length) return;
    await fs.appendFile(LOG_PATH, logBuf.join('\n') + '\n', 'utf-8');
    logBuf = [];
  }

  const keysDir = path.join(process.cwd(), 'keys');
  const keyManager = new KeyRotationManager();
  await keyManager.init(keysDir, ['1.env', '2.env', '3.env']);
  await log('🔑 KeyManager (4.env)\n');

  const found    = new Map<string, any>();
  let   totalReq = 0;
  let   keysOk   = true;

  async function suggest(query: string, count = COUNT): Promise<any> {
    if (!keysOk) return { suggestions: [] };
    try {
      const resp = await keyManager.getClient().suggestCourt(query, { count });
      keysOk = await keyManager.trackRequest();
      totalReq++;
      return resp;
    } catch (e: any) {
      if (e.message?.includes('quota') || e.message?.includes('disabled')) {
        keysOk = await keyManager.trackRequest();
      }
      return { suggestions: [] };
    }
  }

  function register(court: any) {
    if (!found.has(court.code)) found.set(court.code, court);
  }

  async function save() {
    const courts = Array.from(found.values()).sort((a, b) => a.code.localeCompare(b.code));
    await fs.writeFile(OUT_PATH, JSON.stringify({
      meta: { timestamp: new Date().toISOString(), total: courts.length, requests: totalReq },
      courts,
    }, null, 2), 'utf-8');
    await flushLog();
  }

  async function delay() { await new Promise(r => setTimeout(r, DELAY_MS)); }

  // ═══════════════════════════════════════════════════════════════════
  // ФАЗА А: suggest(type, 20) × 14 типов
  // ═══════════════════════════════════════════════════════════════════
  await log('═══ ФАЗА А: по типу (14 запросов) ═══');
  const detectedSaturated: string[] = [];

  for (const type of ALL_TYPES) {
    const resp = await suggest(type, COUNT);
    const suggs: any[] = resp.suggestions ?? [];
    for (const s of suggs) register(s.data);
    if (suggs.length === COUNT) detectedSaturated.push(type);
    await delay();
  }

  // Объединяем автоопределённые + гарантированно насыщенные
  const saturatedTypes = [...new Set([...detectedSaturated, ...ALWAYS_ENUMERATE])];

  await log(`  Найдено: ${found.size} судов за ${totalReq} запросов`);
  await log(`  Автоопределены насыщенные: [${detectedSaturated.join(', ')}]`);
  await log(`  Итого на Фазу Б:           [${saturatedTypes.join(', ')}]\n`);
  await save();

  // ═══════════════════════════════════════════════════════════════════
  // ФАЗА Б: suggest(NNtype, 20) × 100 регионов × saturatedTypes
  // ═══════════════════════════════════════════════════════════════════
  await log('═══ ФАЗА Б: по региону+тип (насыщенные типы) ═══');
  const saturatedPrefixes: string[] = [];
  const reqBefore = totalReq;

  for (const type of saturatedTypes) {
    for (let r = 0; r <= 99 && keysOk; r++) {
      const region = String(r).padStart(2, '0');
      const prefix = `${region}${type}`;
      const resp   = await suggest(prefix, COUNT);
      const suggs: any[] = resp.suggestions ?? [];
      for (const s of suggs) register(s.data);
      if (suggs.length === COUNT) saturatedPrefixes.push(prefix);
      await delay();
    }
  }

  await log(`  Найдено: ${found.size} судов за ${totalReq - reqBefore} запросов`);
  await log(`  Насыщенные префиксы: [${saturatedPrefixes.join(', ')}]\n`);
  await save();

  // ═══════════════════════════════════════════════════════════════════
  // ФАЗА В: прямой перебор насыщенных префиксов
  // ═══════════════════════════════════════════════════════════════════
  await log('═══ ФАЗА В: прямой перебор насыщенных префиксов ═══');
  const EMPTY_STOP = 15;
  const reqBefore2 = totalReq;

  for (const prefix of saturatedPrefixes) {
    const nums = Array.from(found.values())
      .filter(c => c.code.startsWith(prefix))
      .map(c => parseInt(c.code.substring(4), 10));
    if (!nums.length) continue;
    const maxNum = Math.max(...nums);

    await log(`  🔍 ${prefix}: текущий MAX=${pad(maxNum)}, перебираем...`);

    let consecutive = 0;
    for (let n = 1; n <= maxNum + 500 && consecutive < EMPTY_STOP && keysOk; n++) {
      const code = prefix + pad(n);
      if (found.has(code)) { consecutive = 0; continue; }
      const resp  = await suggest(code, 1);
      const suggs: any[] = resp.suggestions ?? [];
      if (suggs.length > 0) {
        register(suggs[0].data);
        consecutive = 0;
      } else {
        consecutive++;
      }
      await delay();
    }

    const newNums = Array.from(found.values())
      .filter(c => c.code.startsWith(prefix))
      .map(c => parseInt(c.code.substring(4), 10));
    await log(`  ✔ ${prefix}: MAX после перебора=${pad(Math.max(...newNums))}`);
  }

  await log(`  Найдено итого: ${found.size} судов за ${totalReq - reqBefore2} запросов в фазе В\n`);
  await save();

  // ═══════════════════════════════════════════════════════════════════
  // ИТОГ
  // ═══════════════════════════════════════════════════════════════════
  await keyManager.shutdown();
  const stats = keyManager.getStats();

  await log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log(`📊 Всего запросов:   ${totalReq}`);
  await log(`📊 Уникальных судов: ${found.size}`);
  await log(`🔑 Остаток (счётчик): ${stats.keysRemaining}`);
  await log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('\n📋 Распределение по типам:');
  for (const type of ALL_TYPES) {
    const cnt = Array.from(found.values()).filter(c => c.code.substring(2, 4) === type).length;
    if (cnt > 0) await log(`  ${type.padEnd(3)}: ${cnt}`);
  }

  await save();
  await flushLog();
}

main().catch(console.error);