import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';

async function main() {
  console.log('\n🔍 Тестируем разные способы поиска Верховного Суда\n');

  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const queries = [
    '00VS',
    '00VS0000',
    'VS',
    'Верховный',
    'Верховный Суд',
    '00',
  ];

  for (const query of queries) {
    try {
      console.log(`\n📝 Запрос: "${query}"`);
      const resp = await apiClient.suggestCourt(query, { count: 5 });
      
      if (resp.suggestions.length > 0) {
        console.log(`✅ Найдено: ${resp.suggestions.length} результатов`);
        resp.suggestions.forEach((s, i) => {
          console.log(`  ${i+1}. ${s.data.code}: ${s.data.name}`);
        });
      } else {
        console.log(`❌ Ничего не найдено`);
      }
    } catch (e: any) {
      console.log(`❌ Ошибка: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }

  await apiClient.shutdown();
}

main().catch(console.error);
