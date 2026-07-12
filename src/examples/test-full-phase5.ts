// src/examples/test-full-phase5.ts
import '../env';
import { ApiClient } from '../core/ApiClient';
import { FullHarvester } from '../core/FullHarvester';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  console.log('\n🌐 Court-Harvester – Фаза 5 (поиск по пропускам)\n');

  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Ошибка: не найден DADATA_API_KEY в .env');
    process.exit(1);
  }

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  try {
    const harvester = new FullHarvester(apiClient, {
      outputDir: './data',
      batchDelay: 50,
      maxDepth: 1,
      checkpointInterval: 100,
      debug: false,
    });

    // 1. Загружаем существующую базу (7762 суда)
    await harvester.loadFromFile('courts_full_phase4.json');
    const startCount = harvester.getCourts().length;
    console.log(`✅ Загружено судов: ${startCount}\n`);

    // 2. Загружаем список пропусков
    const gapsPath = path.join(process.cwd(), 'data', 'missing_codes.json');
    const missingCodes: string[] = JSON.parse(await fs.readFile(gapsPath, 'utf-8'));
    console.log(`📋 Пропусков для проверки: ${missingCodes.length}\n`);

    // 3. Запускаем поиск по пропускам
    await harvester.runExtraQueries(missingCodes);

    // 4. Статистика
    const endCount = harvester.getCourts().length;
    const added = endCount - startCount;
    const notFound = missingCodes.length - added;

    console.log('\n📈 Итоги Фазы 5:');
    console.log(`  Было судов: ${startCount}`);
    console.log(`  Добавлено: ${added}`);
    console.log(`  Стало судов: ${endCount}`);
    console.log(`  Не найдено: ${notFound} (${((notFound / missingCodes.length) * 100).toFixed(1)}%)`);

    // 5. Сохраняем результат в courts_full_phase5.json
    await harvester.saveResults('courts_full_phase5.json');

    await apiClient.shutdown();
    console.log('\n✅ Фаза 5 завершена\n');
    console.log('💾 Итоги сохранены в ./data/courts_full_phase5.json\n');
  } catch (e) {
    console.error('\n❌ Ошибка в фазе 5:', e);
    await apiClient.shutdown();
    process.exit(1);
  }
}

main().catch(console.error);
