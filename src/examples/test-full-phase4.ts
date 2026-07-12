import '../env';
import { ApiClient } from '../core/ApiClient';
import { FullHarvester } from '../core/FullHarvester';

const EXTRA_QUERIES_DIGITS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '1-й',
  '2-й',
  '3-й',
  '4-й',
  '5-й',
  '1-й судебный',
  '2-й судебный',
];

const EXTRA_QUERIES_TERMS = [
  'судебный участок',
  'мировой судья',
  'мировой суд',
  'районный суд',
  'городской суд',
  'межрайонный суд',
  'военный суд',
  'гарнизонный суд',
  'окружной суд',
  'арбитражный суд',
];

async function main() {
  console.log('\n🌐 Court-Harvester – Фаза 4 (дополнительные запросы)\n');

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
      checkpointInterval: 50,
      debug: false,
    });

    // 1) загружаем уже собранные 7761 суда
    await harvester.loadFromFile('courts_full.json');

    // 2) запускаем только фазу 4
    const allQueries = [...EXTRA_QUERIES_DIGITS, ...EXTRA_QUERIES_TERMS];
    await harvester.runExtraQueries(allQueries);

    const courts = harvester.getCourts();
    console.log('\n📈 Итог после фазы 4:');
    console.log(`  Уникальных судов: ${courts.length}`);

    await apiClient.shutdown();
    console.log('\n✅ Фаза 4 завершена\n');
    console.log('💾 Итоги сохранены в ./data/courts_full_phase4.json\n');
  } catch (e) {
    console.error('\n❌ Ошибка в фазе 4:', e);
    await apiClient.shutdown();
    process.exit(1);
  }
}

main().catch(console.error);
