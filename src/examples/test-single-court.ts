// test-single-court.ts
import 'dotenv/config';
import { ApiClient } from '../core/ApiClient';

async function main() {
  const apiClient = new ApiClient({
    apiKey: process.env.DADATA_API_KEY!,
    secretKey: process.env.DADATA_SECRET_KEY,
  });

  const query = '59OS0000';
  console.log(`\n🔍 Запрос: "${query}"`);
  console.log('─'.repeat(60));

  const response = await apiClient.suggestCourt(query, { count: 20 });

  console.log(`\nВсего результатов: ${response.suggestions.length}`);

  const bySameCode = response.suggestions.filter(s => s.data.code === query);
  console.log(`С точным кодом ${query}: ${bySameCode.length}\n`);

  for (const s of bySameCode) {
    console.log(`code:    ${s.data.code}`);
    console.log(`name:    ${s.data.name}`);
    console.log(`address: ${s.data.address}`);
    console.log(`inn:     ${s.data.inn}`);
    console.log('─'.repeat(60));
  }

  // Все результаты для полноты картины
  if (response.suggestions.length > bySameCode.length) {
    console.log('\nОстальные результаты (другие коды):');
    for (const s of response.suggestions.filter(s => s.data.code !== query)) {
      console.log(`  ${s.data.code} | ${s.data.address}`);
    }
  }

  await apiClient.shutdown();
}

main().catch(console.error);