// src/examples/count-prefixes.ts
import { promises as fs } from 'fs';
import path from 'path';

async function countPrefixes() {
  console.log('\n📊 Подсчет префиксов XXBB\n');
  
  const filepath = path.join(process.cwd(), 'data', 'courts_full_phase5.json');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  const courts = data.courts;
  
  console.log(`✅ Загружено судов: ${courts.length}\n`);
  
  // Извлекаем уникальные префиксы XXBB
  const prefixes = new Set<string>();
  
  for (const court of courts) {
    const code = court.code;
    if (!code || code.length < 4) continue;
    
    const prefix = code.substring(0, 4); // XXBB
    prefixes.add(prefix);
  }
  
  const prefixCount = prefixes.size;
  console.log(`📌 Уникальных префиксов XXBB: ${prefixCount}\n`);
  
  // Считаем допустимое количество пустых
  console.log('=== Расчет лимита пустых запросов ===\n');
  
  const budget5k = 5000;
  const budget6k = 6000;
  
  const limit5k = Math.floor(budget5k / prefixCount);
  const limit6k = Math.floor(budget6k / prefixCount);
  
  console.log(`Бюджет 5,000 запросов: ${limit5k} пустых на префикс`);
  console.log(`Бюджет 6,000 запросов: ${limit6k} пустых на префикс`);
  
  console.log(`\n💡 Рекомендация: ${limit5k}-${limit6k} пустых подряд`);
  console.log(`✅ Это даст максимум ${prefixCount} × ${limit6k} = ${prefixCount * limit6k} запросов\n`);
}

countPrefixes().catch(console.error);
