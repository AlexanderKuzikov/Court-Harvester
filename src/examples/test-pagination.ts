import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';

/**
 * Эксперимент: проверка пагинации и стабильности результатов
 */
async function main() {
  console.log('\n🧪 Эксперимент: проверка DaData API\n');

  if (!process.env.DADATA_API_KEY) {
    console.error('❌ Не найден DADATA_API_KEY');
    process.exit(1);
  }

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  try {
    console.log('=== Тест 1: Пустой запрос ===\n');
    
    const empty1 = await apiClient.suggestCourt('', { count: 10 });
    console.log(`Получено: ${empty1.suggestions.length} судов`);
    console.log('Первые 5 кодов:', empty1.suggestions.slice(0, 5).map(s => s.data.code).join(', '));

    console.log('\n⌨️  Ждём 2 секунды...\n');
    await delay(2000);

    console.log('=== Тест 2: Повторный пустой запрос ===\n');
    
    const empty2 = await apiClient.suggestCourt('', { count: 10 });
    console.log(`Получено: ${empty2.suggestions.length} судов`);
    console.log('Первые 5 кодов:', empty2.suggestions.slice(0, 5).map(s => s.data.code).join(', '));

    // Сравнение
    const codes1 = empty1.suggestions.map(s => s.data.code);
    const codes2 = empty2.suggestions.map(s => s.data.code);
    const identical = JSON.stringify(codes1) === JSON.stringify(codes2);
    
    console.log(`\n✅ Порядок идентичен: ${identical ? 'ДА' : 'НЕТ'}`);

    console.log('\n=== Тест 3: Проверка других запросов ===\n');

    const testQueries = [
      { query: '', count: 5 },
      { query: '*', count: 5 },
      { query: ' ', count: 5 },
      { query: 'суд', count: 5 },
    ];

    for (const test of testQueries) {
      const result = await apiClient.suggestCourt(test.query, { count: test.count });
      console.log(`Запрос "${test.query}": ${result.suggestions.length} рез-в, коды: ${result.suggestions.map(s => s.data.code).join(', ')}`);
      await delay(500);
    }

    console.log('\n=== Тест 4: Проверка count ===\n');

    const count5 = await apiClient.suggestCourt('', { count: 5 });
    const count10 = await apiClient.suggestCourt('', { count: 10 });
    const count20 = await apiClient.suggestCourt('', { count: 20 });

    console.log(`count=5:  ${count5.suggestions.length} рез-в`);
    console.log(`count=10: ${count10.suggestions.length} рез-в`);
    console.log(`count=20: ${count20.suggestions.length} рез-в`);

    // Проверяем, что первые 5 в count=10 = всем count=5
    const first5FromCount10 = count10.suggestions.slice(0, 5).map(s => s.data.code);
    const allFromCount5 = count5.suggestions.map(s => s.data.code);
    const consistent = JSON.stringify(first5FromCount10) === JSON.stringify(allFromCount5);

    console.log(`\n✅ Первые 5 из count=10 совпадают с count=5: ${consistent ? 'ДА' : 'НЕТ'}`);

    console.log('\n=== Тест 5: Попытка offset/page (может не работать) ===\n');

    try {
      // @ts-ignore - пробуем параметры которых может не быть
      const withOffset = await apiClient.suggestCourt('', { count: 5, offset: 10 });
      console.log(`offset=10: ${withOffset.suggestions.length} рез-в, коды: ${withOffset.suggestions.map(s => s.data.code).join(', ')}`);
    } catch (e) {
      console.log(`⚠️  offset не поддерживается: ${e instanceof Error ? e.message : e}`);
    }

    try {
      // @ts-ignore
      const withPage = await apiClient.suggestCourt('', { count: 5, page: 2 });
      console.log(`page=2: ${withPage.suggestions.length} рез-в, коды: ${withPage.suggestions.map(s => s.data.code).join(', ')}`);
    } catch (e) {
      console.log(`⚠️  page не поддерживается: ${e instanceof Error ? e.message : e}`);
    }

    console.log('\n=== Резюме ===\n');
    console.log('Статистика API:', apiClient.getStats());

    await apiClient.shutdown();
    console.log('\n✅ Эксперимент завершён!\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error);
    await apiClient.shutdown();
    process.exit(1);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
