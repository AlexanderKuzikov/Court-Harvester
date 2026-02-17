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
}

interface DatabaseFile {
  meta: any;
  courts: Court[];
}

async function main() {
  console.log('\n🔍 Проверка региона 00 (федеральные суды) - умный поиск\n');

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const courtsPath = path.join(process.cwd(), 'data', 'courts_full_final_sorted.json');
  const data: DatabaseFile = JSON.parse(await fs.readFile(courtsPath, 'utf-8'));
  const courtsMap = new Map<string, Court>(data.courts.map((c) => [c.code, c]));

  console.log(`✅ База: ${courtsMap.size} судов\n`);

  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'AV', 'KV', 'VS', 'KJ', 'AJ', 'AA', 'AO', 'AI'];
  
  let found = 0;

  console.log('🔎 Поиск по префиксам 00XX...\n');

  for (const type of types) {
    const query = `00${type}`;
    
    try {
      console.log(`🔍 Проверка: ${query}`);
      const resp = await apiClient.suggestCourt(query, { count: 20 });
      
      for (const suggestion of resp.suggestions) {
        const court = suggestion.data;
        if (court.code.startsWith('00') && !courtsMap.has(court.code)) {
          console.log(`✅ НОВЫЙ: ${court.code} - ${court.name}`);
          courtsMap.set(court.code, court);
          found++;
        }
      }
      
    } catch (e: any) {
      if (e.message?.includes('quota')) {
        console.log(`\n⚠️  Лимит API исчерпан`);
        break;
      }
    }
    
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n📊 Итог:`);
  console.log(`  Проверено типов: ${types.length}`);
  console.log(`  Найдено новых судов: ${found}`);
  console.log(`  Итого судов: ${courtsMap.size}`);

  if (found > 0) {
    const output: DatabaseFile = {
      meta: {
        totalCourts: courtsMap.size,
        timestamp: new Date().toISOString(),
        phase: 'phase8-region-00',
      },
      courts: Array.from(courtsMap.values()).sort((a: Court, b: Court) => a.code.localeCompare(b.code)),
    };

    const outPath = path.join(process.cwd(), 'data', 'courts_full_phase8.json');
    await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n💾 Сохранено: ${outPath}\n`);
  } else {
    console.log('\n✅ Новых судов в регионе 00 не найдено (все уже в базе)\n');
  }

  await apiClient.shutdown();
}

main().catch(console.error);
