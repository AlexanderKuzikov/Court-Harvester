import 'dotenv/config';
import { ApiClient, QuotaExceededError, DaDataApiError } from '../core/ApiClient';

/**
 * Пример использования ApiClient
 */
async function main() {
  // Инициализируем клиент
  const client = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
    rateLimit: {
      maxConcurrent: 5,
      minTime: 50, // 20 запросов/сек
    },
  });

  try {
    console.log('=== Пример 1: Поиск судов Пермского края ===\n');
    
    const result1 = await client.suggestCourt('суд', {
      region_code: '59',
      count: 5,
    });

    console.log(`Найдено: ${result1.suggestions.length} судов`);
    result1.suggestions.forEach((s, i) => {
      console.log(`${i + 1}. ${s.value}`);
      console.log(`   Код: ${s.data.code}, Тип: ${s.data.court_type_name}`);
      console.log(`   Адрес: ${s.data.address}\n`);
    });

    // Статистика после первого запроса
    console.log('\nСтатистика:', client.getStats());
    console.log('Limiter:', client.getLimiterStatus());

    console.log('\n=== Пример 2: Поиск арбитражных судов ===\n');

    const result2 = await client.suggestCourt('арбитраж', {
      region_code: '59',
      court_type: 'AS',
      count: 3,
    });

    console.log(`Найдено: ${result2.suggestions.length} арбитражных судов`);
    result2.suggestions.forEach((s, i) => {
      console.log(`${i + 1}. ${s.value}`);
      console.log(`   Сайт: ${s.data.website || 'нет данных'}\n`);
    });

    console.log('\n=== Пример 3: Массовые запросы (тест rate limiting) ===\n');

    const searches = ['мировой', 'районный', 'городской'];
    const promises = searches.map((query) =>
      client.suggestCourt(query, { region_code: '59', count: 2 })
    );

    console.log('Запуск 3 параллельных запросов...');
    const results = await Promise.all(promises);
    
    results.forEach((result, i) => {
      console.log(`${searches[i]}: ${result.suggestions.length} результатов`);
    });

  } catch (error) {
    if (error instanceof QuotaExceededError) {
      console.error('\n⚠️  Превышена квота DaData API:', error.message);
      console.error('Попробуйте повторить завтра.');
    } else if (error instanceof DaDataApiError) {
      console.error('\n❌ Ошибка DaData API:', error.message);
      console.error('Статус:', error.statusCode);
      console.error('Данные:', error.responseData);
    } else {
      console.error('\n❌ Неожиданная ошибка:', error);
    }
  } finally {
    // Финальная статистика
    console.log('\n=== Финальная статистика ===');
    console.log(client.getStats());
    
    // Graceful shutdown
    await client.shutdown();
  }
}

// Запуск
main().catch(console.error);
