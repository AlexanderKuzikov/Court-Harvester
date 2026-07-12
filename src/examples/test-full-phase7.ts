// src/examples/test-full-phase7.ts
import '../env';
import { ApiClient } from '../core/ApiClient';
import { promises as fs } from 'fs';
import path from 'path';
import { CourtData } from '../types/dadata';

async function main() {
  console.log('\n🌐 Court-Harvester – Фаза 7 (поиск ниже MIN)\n');

  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Ошибка: не найден DADATA_API_KEY в .env');
    process.exit(1);
  }

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  try {
    // 1. Загружаем результаты Фазы 6
    const courtsPath = path.join(process.cwd(), 'data', 'courts_full_phase6.json');
    const courtsData = JSON.parse(await fs.readFile(courtsPath, 'utf-8'));
    const courts: CourtData[] = courtsData.courts;
    
    console.log(`✅ Загружено судов: ${courts.length}\n`);

    // 2. Загружаем список пропущенных кодов
    const missingPath = path.join(process.cwd(), 'data', 'missing_before_min.json');
    const missingCodes: string[] = JSON.parse(await fs.readFile(missingPath, 'utf-8'));
    
    console.log(`📋 Кодов для проверки: ${missingCodes.length}\n`);

    // 3. Создаем Map для быстрого доступа
    const courtsMap = new Map<string, CourtData>();
    courts.forEach(c => courtsMap.set(c.code, c));

    // 4. Проверяем каждый код
    let totalAdded = 0;
    let processed = 0;
    
    for (const code of missingCodes) {
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`📊 Обработано: ${processed}/${missingCodes.length}, добавлено: ${totalAdded}`);
      }
      
      try {
        const response = await apiClient.suggestCourt(code, { count: 5 });
        
        if (response.suggestions.length > 0) {
          const court = response.suggestions[0].data;
          if (court.code && !courtsMap.has(court.code)) {
            courtsMap.set(court.code, court);
            totalAdded++;
          }
        }
      } catch (error: any) {
        if (error.message && error.message.includes('quota')) {
          console.error(`\n❌ Превышен лимит API на запросе ${processed}/${missingCodes.length}`);
          console.log(`💾 Сохраняем промежуточный результат...\n`);
          break;
        }
        console.error(`⚠️  Ошибка при запросе ${code}:`, error);
      }
      
      // Задержка
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 5. Сохраняем результаты
    const finalCourts = Array.from(courtsMap.values());
    
    const output = {
      meta: {
        totalCourts: finalCourts.length,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        phase: 7,
        processedCodes: processed,
        totalMissingCodes: missingCodes.length,
      },
      courts: finalCourts,
    };
    
    const outputPath = path.join(process.cwd(), 'data', 'courts_full_phase7.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log('\n📈 Итоги Фазы 7:');
    console.log(`  Было судов: ${courts.length}`);
    console.log(`  Добавлено: ${totalAdded}`);
    console.log(`  Стало судов: ${finalCourts.length}`);
    console.log(`  Обработано кодов: ${processed}/${missingCodes.length}`);
    
    if (processed < missingCodes.length) {
      console.log(`\n⚠️  Не все коды проверены (лимит API)`);
      console.log(`  Осталось проверить: ${missingCodes.length - processed}`);
    }

    await apiClient.shutdown();
    console.log('\n✅ Фаза 7 завершена\n');
    console.log('💾 Итоги сохранены в ./data/courts_full_phase7.json\n');
  } catch (e) {
    console.error('\n❌ Ошибка в фазе 7:', e);
    await apiClient.shutdown();
    process.exit(1);
  }
}

main().catch(console.error);
