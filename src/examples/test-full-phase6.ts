// src/examples/test-full-phase6.ts
import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';
import { promises as fs } from 'fs';
import path from 'path';
import { CourtData } from '../types/dadata';

const EMPTY_LIMIT = 15; // Останавливаемся после 15 пустых подряд

async function main() {
  console.log('\n🌐 Court-Harvester – Фаза 6 (поиск хвостов MAX+N)\n');

  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Ошибка: не найден DADATA_API_KEY в .env');
    process.exit(1);
  }

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  try {
    // 1. Загружаем результаты Фазы 5
    const filepath = path.join(process.cwd(), 'data', 'courts_full_phase5.json');
    const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
    const courts: CourtData[] = data.courts;
    
    console.log(`✅ Загружено судов: ${courts.length}\n`);

    // 2. Группируем по префиксам и находим MAX(YYYY)
    const byPrefix = new Map<string, { maxNum: number; courts: CourtData[] }>();
    
    for (const court of courts) {
      const code = court.code;
      if (!code || code.length < 6) continue;
      
      const prefix = code.substring(0, 4); // XXBB
      const numStr = code.substring(4);
      const num = parseInt(numStr, 10);
      
      if (isNaN(num)) continue;
      
      if (!byPrefix.has(prefix)) {
        byPrefix.set(prefix, { maxNum: num, courts: [] });
      }
      
      const entry = byPrefix.get(prefix)!;
      if (num > entry.maxNum) {
        entry.maxNum = num;
      }
      entry.courts.push(court);
    }
    
    console.log(`📌 Уникальных префиксов: ${byPrefix.size}`);
    console.log(`🔍 Лимит пустых подряд: ${EMPTY_LIMIT}\n`);

    // 3. Создаем Map для быстрого доступа по коду
    const courtsMap = new Map<string, CourtData>();
    courts.forEach(c => courtsMap.set(c.code, c));

    // 4. Для каждого префикса ищем хвосты
    let totalRequests = 0;
    let totalAdded = 0;
    let processedPrefixes = 0;
    
    const prefixes = Array.from(byPrefix.keys()).sort();
    
    for (const prefix of prefixes) {
      processedPrefixes++;
      const { maxNum } = byPrefix.get(prefix)!;
      
      let currentNum = maxNum + 1;
      let emptyCount = 0;
      let addedForPrefix = 0;
      
      while (emptyCount < EMPTY_LIMIT) {
        const code = prefix + String(currentNum).padStart(4, '0');
        totalRequests++;
        
        try {
          const response = await apiClient.suggestCourt(code, { count: 5 });
          
          if (response.suggestions.length > 0) {
            // Найден суд
            const court = response.suggestions[0].data;
            if (court.code && !courtsMap.has(court.code)) {
              courtsMap.set(court.code, court);
              addedForPrefix++;
              totalAdded++;
            }
            emptyCount = 0; // Сброс счетчика
          } else {
            emptyCount++;
          }
        } catch (error) {
          console.error(`⚠️  Ошибка при запросе ${code}:`, error);
          emptyCount++;
        }
        
        currentNum++;
        
        // Задержка
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      if (processedPrefixes % 50 === 0 || addedForPrefix > 0) {
        console.log(`📊 [${processedPrefixes}/${prefixes.length}] ${prefix}: MAX=${maxNum}, добавлено=${addedForPrefix}, запросов=${totalRequests}`);
      }
    }

    // 5. Сохраняем результаты
    const finalCourts = Array.from(courtsMap.values());
    
    const output = {
      meta: {
        totalCourts: finalCourts.length,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        phase: 6,
      },
      courts: finalCourts,
    };
    
    const outputPath = path.join(process.cwd(), 'data', 'courts_full_phase6.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log('\n📈 Итоги Фазы 6:');
    console.log(`  Было судов: ${courts.length}`);
    console.log(`  Добавлено: ${totalAdded}`);
    console.log(`  Стало судов: ${finalCourts.length}`);
    console.log(`  Запросов выполнено: ${totalRequests}`);

    await apiClient.shutdown();
    console.log('\n✅ Фаза 6 завершена\n');
    console.log('💾 Итоги сохранены в ./data/courts_full_phase6.json\n');
  } catch (e) {
    console.error('\n❌ Ошибка в фазе 6:', e);
    await apiClient.shutdown();
    process.exit(1);
  }
}

main().catch(console.error);
