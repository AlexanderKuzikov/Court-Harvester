import '../env';
import { KeyRotationManager } from '../core/KeyRotationManager';
import path from 'path';

async function main() {
  const keyManager = new KeyRotationManager();
  // Используем только 3.env и 4.env
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env', '2.env']);

  let keysOk = true;
  let totalRequests = 0;

  async function suggestCourt(query: string, count = 1): Promise<any> {
    try {
      const resp = await keyManager.getClient().suggestCourt(query, { count });
      keysOk = await keyManager.trackRequest();
      totalRequests++;
      return resp;
    } catch (e: any) {
      if (e.message?.includes('quota') || e.message?.includes('disabled')) {
        keysOk = await keyManager.trackRequest();
      }
      return { suggestions: [] };
    }
  }

  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];

  // ──────────────────────────────────────────
  // Тест 1: Регион 00 — все типы с count=20
  // ──────────────────────────────────────────
  console.log('\n🔍 Тест 1: Регион 00 (все типы, count=20)...\n');

  for (const type of types) {
    if (!keysOk) break;
    const resp = await suggestCourt(`00${type}`, 20);
    if (resp.suggestions.length > 0) {
      for (const s of resp.suggestions) {
        console.log(`  ✅ code=${s.data.code} | type=${s.data.court_type} | ${s.data.name}`);
      }
    } else {
      console.log(`  ❌ 00${type} → ничего`);
    }
    await new Promise(r => setTimeout(r, 20));
  }

  // ──────────────────────────────────────────
  // Тест 2: Новые регионы 90-96 — все типы
  // ──────────────────────────────────────────
  console.log('\n🔍 Тест 2: Новые регионы 90-96 (все типы, count=20)...\n');

  const newRegions = ['90', '91', '92', '93', '94', '95', '96'];
  const found = new Map<string, any>();

  for (const region of newRegions) {
    if (!keysOk) break;
    console.log(`  📍 Регион ${region}:`);
    let foundInRegion = 0;

    for (const type of types) {
      if (!keysOk) break;
      const resp = await suggestCourt(`${region}${type}`, 20);

      for (const s of resp.suggestions) {
        if (!found.has(s.data.code ?? s.data.inn)) {
          found.set(s.data.code ?? s.data.inn, s.data);
          foundInRegion++;
          const codeStr = s.data.code ?? `null (inn=${s.data.inn})`;
          console.log(`    ✅ code=${codeStr} | type=${s.data.court_type} | ${s.data.name}`);
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }

    if (foundInRegion === 0) console.log(`    ❌ Ничего не найдено`);
  }

  // ──────────────────────────────────────────
  // Тест 3: AS для новых регионов напрямую по коду
  // ──────────────────────────────────────────
  console.log('\n🔍 Тест 3: Прямой перебор AS для регионов 90-96 (0000-0010)...\n');

  for (const region of newRegions) {
    if (!keysOk) break;
    for (let num = 0; num <= 10; num++) {
      if (!keysOk) break;
      const code = `${region}AS${String(num).padStart(4, '0')}`;
      const resp = await suggestCourt(code, 1);
      if (resp.suggestions.length > 0 && resp.suggestions[0].data.code === code) {
        console.log(`  ✅ ${code} | ${resp.suggestions[0].data.name}`);
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Всего запросов: ${totalRequests}`);
  console.log(`📊 Уникальных судов в новых регионах: ${found.size}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await keyManager.shutdown();
}

main().catch(console.error);