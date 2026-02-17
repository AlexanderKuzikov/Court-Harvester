// src/examples/test-missing-codes.ts
import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';
import { promises as fs } from 'fs';
import path from 'path';

async function testMissingCodes() {
  console.log('\n🧪 Тестируем поиск по пропущенным кодам\n');
  
  // Проверяем токен
  if (!process.env.DADATA_API_KEY) {
    throw new Error('❌ DADATA_API_KEY не найден в .env');
  }
  
  console.log(`🔑 Токен: ${process.env.DADATA_API_KEY.substring(0, 10)}...\n`);
  
  // Загружаем список пропусков
  const gapsPath = path.join(process.cwd(), 'data', 'missing_codes.json');
  const allGaps: string[] = JSON.parse(await fs.readFile(gapsPath, 'utf-8'));
  
  console.log(`✅ Загружено пропусков: ${allGaps.length}\n`);
  
  // Выбираем 20 случайных из разных префиксов
  const byPrefix = new Map<string, string[]>();
  
  for (const code of allGaps) {
    const prefix = code.substring(0, 4); // XXBB
    if (!byPrefix.has(prefix)) {
      byPrefix.set(prefix, []);
    }
    byPrefix.get(prefix)!.push(code);
  }
  
  console.log(`📊 Пропуски распределены по ${byPrefix.size} префиксам\n`);
  
  // Берем по 1 случайному коду из первых 20 префиксов
  const testCodes: string[] = [];
  const prefixes = Array.from(byPrefix.keys()).sort();
  
  for (let i = 0; i < Math.min(20, prefixes.length); i++) {
    const prefix = prefixes[i];
    const codes = byPrefix.get(prefix)!;
    const randomIndex = Math.floor(Math.random() * codes.length);
    testCodes.push(codes[randomIndex]);
  }
  
  console.log('=== Тестируем 20 случайных кодов ===\n');
  testCodes.forEach((code, i) => {
    console.log(`${i + 1}. ${code}`);
  });
  console.log('\n');
  
  // Создаем API клиент (как в test-full-phase4.ts)
  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });
  
  // Тестируем каждый код
  const results: Array<{ code: string; found: boolean; count: number; name?: string }> = [];
  
  for (const code of testCodes) {
    try {
      const response = await apiClient.suggestCourt(code, { count: 5 });
      const found = response.suggestions.length > 0;
      
      if (found) {
        const firstResult = response.suggestions[0].data;
        console.log(`✅ ${code}: НАЙДЕН! "${firstResult.name}" (code: ${firstResult.code})`);
        results.push({
          code,
          found: true,
          count: response.suggestions.length,
          name: firstResult.name,
        });
      } else {
        console.log(`❌ ${code}: не найден`);
        results.push({ code, found: false, count: 0 });
      }
      
      // Небольшая задержка
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`⚠️  ${code}: ошибка запроса - ${error}`);
      results.push({ code, found: false, count: 0 });
    }
  }
  
  // Статистика
  const foundCount = results.filter(r => r.found).length;
  const notFoundCount = results.length - foundCount;
  
  console.log('\n=== Итоги теста ===');
  console.log(`✅ Найдено: ${foundCount}/${results.length} (${((foundCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Не найдено: ${notFoundCount}/${results.length}`);
  
  if (foundCount > 0) {
    console.log('\n🎉 Отлично! DaData возвращает результаты по кодам.');
    console.log('   Можем использовать эту стратегию для Фазы 5.');
  } else {
    console.log('\n⚠️  DaData не возвращает результаты по точным кодам.');
    console.log('   Нужна другая стратегия.');
  }
  
  // Сохраняем результаты теста
  const testResultPath = path.join(process.cwd(), 'data', 'test_results.json');
  await fs.writeFile(
    testResultPath,
    JSON.stringify({ results, foundCount, notFoundCount }, null, 2),
    'utf-8'
  );
  
  console.log(`\n💾 Результаты теста: ${testResultPath}`);
  
  await apiClient.shutdown();
  console.log('\n✅ Тест завершен\n');
}

testMissingCodes().catch(console.error);
