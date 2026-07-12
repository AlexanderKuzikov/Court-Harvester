// src/examples/check-ai-courts.ts
import '../env';
import { ApiClient } from '../core/ApiClient';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  console.log('\n🔍 Проверка AI судов (Суды по интеллектуальным правам)\n');

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const courtsPath = path.join(process.cwd(), 'data', 'courts_full_phase7.json');
  const data = JSON.parse(await fs.readFile(courtsPath, 'utf-8'));
  const courtsMap = new Map(data.courts.map((c: any) => [c.code, c]));

  console.log(`✅ Загружено: ${courtsMap.size} судов\n`);

  // AI суды — специализированные, их мало. Проверяем только 00-99, номера 0-10
  const aiCodes: string[] = [];
  for (let region = 0; region <= 99; region++) {
    const regionStr = String(region).padStart(2, '0');
    for (let num = 0; num <= 10; num++) { // Сократили с 100 до 10
      const code = `${regionStr}AI${String(num).padStart(4, '0')}`;
      aiCodes.push(code);
    }
  }

  console.log(`📋 Проверяем ${aiCodes.length} AI кодов...\n`);

  let found = 0;
  let processed = 0;
  
  for (const code of aiCodes) {
    processed++;
    
    if (processed % 100 === 0) {
      console.log(`📊 Обработано: ${processed}/${aiCodes.length}, найдено: ${found}`);
    }
    
    try {
      const response = await apiClient.suggestCourt(code, { count: 1 });
      if (response.suggestions.length > 0) {
        const court = response.suggestions[0].data;
        if (!courtsMap.has(court.code)) {
          courtsMap.set(court.code, court);
          found++;
          console.log(`✅ НАЙДЕН: ${court.code} - ${court.name}`);
        }
      }
    } catch (e: any) {
      if (e.message?.includes('quota')) {
        console.log(`\n⚠️  Лимит API исчерпан на ${processed}/${aiCodes.length}`);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 20));
  }

  console.log(`\n📊 Итог: проверено ${processed}/${aiCodes.length}, найдено AI судов: ${found}`);

  if (found > 0) {
    const output = {
      meta: { totalCourts: courtsMap.size, timestamp: new Date().toISOString(), phase: 'AI' },
      courts: Array.from(courtsMap.values()),
    };
    const outPath = path.join(process.cwd(), 'data', 'courts_full_final.json');
    await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 Сохранено: ${courtsMap.size} судов в courts_full_final.json`);
  } else {
    console.log('❌ AI судов не найдено');
  }

  await apiClient.shutdown();
}

main().catch(console.error);
