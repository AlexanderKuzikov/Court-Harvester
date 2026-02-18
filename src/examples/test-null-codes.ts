import 'dotenv/config';
import { KeyRotationManager } from '../core/KeyRotationManager';
import path from 'path';

async function main() {
  const keyManager = new KeyRotationManager();
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env']);

  let keysOk = true;

  async function suggestCourt(query: string, count = 1): Promise<any> {
    try {
      const resp = await keyManager.getClient().suggestCourt(query, { count });
      keysOk = await keyManager.trackRequest();
      return resp;
    } catch (e: any) {
      if (e.message?.includes('quota') || e.message?.includes('disabled')) {
        keysOk = await keyManager.trackRequest();
      }
      return { suggestions: [] };
    }
  }

  // ──────────────────────────────────────────
  console.log('\n🔍 Тест 1: Суды с code=null (расширенный поиск)...\n');

  const queries = [
    'верховный суд',
    'конституционный суд',
    'интеллектуальным',
    'арбитражный суд',
    'кассационный',
    'апелляционный',
    'военный суд',
    'мировой судья',
    'районный суд',
    'областной суд',
    'донецкой народной республики',
    'луганской народной республики',
    'запорожской области',
    'херсонской области',
    'донецк',
    'луганск',
    'запорожье',
    'херсон',
  ];

  const nullCodes = new Map<string, any>();

  for (const q of queries) {
    if (!keysOk) break;
    const resp = await suggestCourt(q, 20);
    for (const s of resp.suggestions) {
      if (s.data.code === null && s.data.inn && !nullCodes.has(s.data.inn)) {
        nullCodes.set(s.data.inn, s.data);
        console.log(`✅ code=null | type=${s.data.court_type} | inn=${s.data.inn} | ${s.data.name}`);
      }
    }
    await new Promise(r => setTimeout(r, 20));
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Итого уникальных судов с code=null: ${nullCodes.size}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // ──────────────────────────────────────────
  console.log('\n🔍 Тест 2а: Регион 00...\n');

  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];

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
  console.log('\n🔍 Тест 2б: Номер 0000 для всех регионов 00-99...\n');

  let found0000 = 0;

  for (let r = 0; r <= 99; r++) {
    if (!keysOk) break;
    const region = String(r).padStart(2, '0');
    for (const type of types) {
      if (!keysOk) break;
      const code = `${region}${type}0000`;
      const resp = await suggestCourt(code, 1);
      if (resp.suggestions.length > 0 && resp.suggestions[0].data.code === code) {
        console.log(`  ✅ ${code} | ${resp.suggestions[0].data.name}`);
        found0000++;
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  if (found0000 === 0) console.log('  ❌ Судов с номером 0000 не найдено');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Судов с номером 0000: ${found0000}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await keyManager.shutdown();
}

main().catch(console.error);