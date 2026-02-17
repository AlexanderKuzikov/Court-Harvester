import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';
import { FullHarvester } from '../core/FullHarvester';

/**
 * Пример полного сбора всех судов РФ
 * С умной детализацией уровня 3
 */
async function main() {
  console.log('\n🌍 Court-Harvester - Полный сбор всех судов РФ\n');

  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Ошибка: Не найден DADATA_API_KEY в .env');
    console.error('Создайте .env файл из .env.example\n');
    process.exit(1);
  }

  try {
    const apiClient = new ApiClient({
      apiKey: process.env.DADATA_API_KEY,
      secretKey: process.env.DADATA_SECRET_KEY,
    });

    const harvester = new FullHarvester(apiClient, {
      outputDir: './data',
      batchDelay: 50, // мс между запросами
      maxDepth: 3, // ВКЛЮЧАЕМ УРОВЕНЬ 3!
      checkpointInterval: 100,
      debug: false,
    });

    // Progress bar
    let lastPercent = 0;
    harvester.setProgressCallback((current, total, message) => {
      const percent = Math.floor((current / total) * 100);
      if (percent !== lastPercent && percent % 5 === 0) {
        const filled = Math.floor((current / total) * 40);
        const bar = '■'.repeat(filled) + '□'.repeat(40 - filled);
        console.log(`[${bar}] ${percent}% - ${message}`);
        lastPercent = percent;
      }
    });

    console.log('🚀 Запуск сбора...\n');
    const result = await harvester.harvest();

    console.log('\n📊 Детальная статистика:');
    console.log('==================');
    console.log(`Уникальных судов: ${result.uniqueCourts}`);
    console.log(`Дубликатов: ${result.duplicates}`);
    console.log(`Запросов API: ${result.queriesExecuted}`);
    console.log(`"Горячих" префиксов: ${result.detailsExpanded}`);

    console.log('\nПокрытие по регионам (ТОП-15):');
    const topRegions = Object.entries(result.byRegion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    
    for (const [region, count] of topRegions) {
      console.log(`  ${region}: ${count} судов`);
    }
    console.log(`  ... и ещё ${Object.keys(result.byRegion).length - 15} регионов`);

    console.log('\nСтатистика по типам:');
    for (const [type, count] of Object.entries(result.byType)) {
      console.log(`  ${type}: ${count}`);
    }

    console.log('\nAPI статистика:');
    console.log(`  Всего запросов: ${result.apiStats.totalRequests}`);
    console.log(`  Успешных: ${result.apiStats.successfulRequests}`);
    console.log(`  Ошибок: ${result.apiStats.failedRequests}`);

    // Показать примеры
    const courts = harvester.getCourts();
    if (courts.length > 0) {
      console.log('\n🏛️ Примеры собранных судов (случайные 5):');
      const samples = courts.sort(() => Math.random() - 0.5).slice(0, 5);
      samples.forEach((court, i) => {
        console.log(`\n${i + 1}. ${court.name}`);
        console.log(`   Код: ${court.code}`);
        console.log(`   Тип: ${court.court_type_name}`);
        console.log(`   Адрес: ${court.address}`);
      });
    }

    await apiClient.shutdown();

    console.log('\n✅ Сбор завершён!\n');
    console.log('💾 Результаты сохранены в ./data/courts_full.json\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  }
}

main().catch(console.error);
