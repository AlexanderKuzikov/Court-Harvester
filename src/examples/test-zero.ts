import '../env';
import { KeyRotationManager } from '../core/KeyRotationManager';
import path from 'path';

async function main() {
  const keyManager = new KeyRotationManager();
  // Используем только 3.env
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env', '2.env']);

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

  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];

  console.log('\n🔍 Проверка номера 0000 для регионов 71-99...\n');

  let found = 0;
  let totalRequests = 0;

  for (let r = 71; r <= 99; r++) {
    if (!keysOk) break;
    const region = String(r).padStart(2, '0');

    for (const type of types) {
      if (!keysOk) break;
      const code = `${region}${type}0000`;
      const resp = await suggestCourt(code, 1);
      totalRequests++;

      if (resp.suggestions.length > 0 && resp.suggestions[0].data.code === code) {
        console.log(`  ✅ ${code} | ${resp.suggestions[0].data.name}`);
        found++;
      }

      await new Promise(r => setTimeout(r, 20));
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Запросов: ${totalRequests}`);
  console.log(`📊 Найдено судов с 0000 (регионы 71-99): ${found}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await keyManager.shutdown();
}

main().catch(console.error);