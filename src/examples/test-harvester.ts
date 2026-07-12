import '../env';
import { ApiClient } from '../core/ApiClient';
import { RegionHarvester } from '../core/RegionHarvester';

/**
 * Пример использования RegionHarvester
 * Собирает суды Пермского края (регион 59)
 */
async function main() {
  console.log('\n🌾 Court-Harvester - Тест Harvester Engine\n');

  // Проверка API ключей
  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Ошибка: Не найден DADATA_API_KEY в .env');
    console.error('Создайте .env файл из .env.example\n');
    process.exit(1);
  }

  try {
    // Инициализация API клиента
    const apiClient = new ApiClient({
      apiKey: process.env.DADATA_API_KEY,
      secretKey: process.env.DADATA_SECRET_KEY,
    });

    // Инициализация харвестера с DEBUG режимом
    const harvester = new RegionHarvester(apiClient, {
      regionCode: '59',
      outputDir: './data',
      batchDelay: 100,
      debug: true, // ВКЛЮЧАЕМ DEBUG
    });

    // Progress callback
    harvester.setProgressCallback((current, total, message) => {
      const percent = ((current / total) * 100).toFixed(0);
      const filled = Math.floor((current / total) * 20);
      const bar = '■'.repeat(filled) + '□'.repeat(20 - filled);
      console.log(`[${bar}] ${percent}% - ${message}`);
    });

    // Запуск сбора
    const result = await harvester.harvest();

    // Детальная статистика
    console.log('\n📊 Детальная статистика:');
    console.log('==================');
    console.log(`Регион: ${result.regionCode}`);
    console.log(`Уникальных судов: ${result.uniqueCourts}`);
    console.log(`Дубликатов отфильтровано: ${result.duplicates}`);
    console.log(`\nСтатистика по типам:`);
    for (const [type, count] of Object.entries(result.byType)) {
      console.log(`  ${type}: ${count}`);
    }

    console.log(`\nAPI запросов: ${result.apiStats.totalRequests}`);
    console.log(`Успешных: ${result.apiStats.successfulRequests}`);
    console.log(`Ошибок: ${result.apiStats.failedRequests}`);

    // Показать первые 5 судов
    const courts = harvester.getCourts();
    if (courts.length > 0) {
      console.log('\n🏛️ Примеры собранных судов (первые 5):');
      courts.slice(0, 5).forEach((court, i) => {
        console.log(`\n${i + 1}. ${court.name}`);
        console.log(`   Код: ${court.code}`);
        console.log(`   Тип: ${court.court_type_name}`);
        console.log(`   Адрес: ${court.address}`);
        if (court.website) {
          console.log(`   Сайт: ${court.website}`);
        }
      });
    }

    // Graceful shutdown
    await apiClient.shutdown();

    console.log('\n✅ Тест завершен!\n');
  } catch (error) {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  }
}

main().catch(console.error);
