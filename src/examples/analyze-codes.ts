// src/examples/analyze-codes.ts
import { promises as fs } from 'fs';
import path from 'path';

interface CourtData {
  code: string;
  name: string;
  court_type: string;
  region?: string;
}

async function analyzeGaps() {
  console.log('\n📊 Анализ кодов судов\n');
  
  const filepath = path.join(process.cwd(), 'data', 'courts_full_phase4.json');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  
  const courts: CourtData[] = data.courts;
  const codes = courts.map(c => c.code).sort();
  
  console.log(`✅ Всего судов: ${codes.length}\n`);
  
  // Примеры кодов
  console.log('=== Примеры кодов ===');
  console.log(codes.slice(0, 15).join(', '));
  
  // Анализ длины кодов
  const lengthStats: Record<number, number> = {};
  codes.forEach(code => {
    const len = code.length;
    lengthStats[len] = (lengthStats[len] || 0) + 1;
  });
  
  console.log('\n=== Длина кодов ===');
  Object.entries(lengthStats)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([len, count]) => {
      console.log(`  ${len} символов: ${count} судов`);
    });
  
  // Группировка по регионам (первые 2 символа)
  const byRegion: Record<string, string[]> = {};
  codes.forEach(code => {
    const region = code.substring(0, 2);
    if (!byRegion[region]) byRegion[region] = [];
    byRegion[region].push(code);
  });
  
  console.log(`\n=== Регионы: ${Object.keys(byRegion).length} ===\n`);
  
  // Сортируем регионы по количеству судов
  const regionStats = Object.entries(byRegion)
    .map(([region, codes]) => ({
      region,
      count: codes.length,
      min: codes[0],
      max: codes[codes.length - 1],
    }))
    .sort((a, b) => b.count - a.count);
  
  // Топ-10 регионов
  console.log('=== ТОП-10 регионов ===');
  regionStats.slice(0, 10).forEach(({ region, count, min, max }) => {
    console.log(`  ${region}: ${count} судов (${min} - ${max})`);
  });
  
  // Худшие 10 регионов
  console.log('\n=== ХУДШИЕ 10 регионов (мало судов) ===');
  regionStats.slice(-10).reverse().forEach(({ region, count, min, max }) => {
    console.log(`  ${region}: ${count} судов (${min} - ${max})`);
  });
  
  // Анализ "дыр" внутри каждого региона
  console.log('\n=== Анализ пропусков в кодах ===');
  
  for (const [region, regionCodes] of Object.entries(byRegion).slice(0, 5)) {
    const sorted = regionCodes.sort();
    
    // Проверяем: если коды числовые после префикса
    const numericSuffixes = sorted
      .map(code => {
        const suffix = code.substring(2);
        const num = parseInt(suffix, 10);
        return isNaN(num) ? null : num;
      })
      .filter(n => n !== null) as number[];
    
    if (numericSuffixes.length > 0) {
      const min = Math.min(...numericSuffixes);
      const max = Math.max(...numericSuffixes);
      const expected = max - min + 1;
      const actual = numericSuffixes.length;
      const gaps = expected - actual;
      
      console.log(`\nРегион ${region}: диапазон ${min}-${max}`);
      console.log(`  Ожидаемо: ${expected}, фактически: ${actual}, пропусков: ${gaps}`);
      
      if (gaps > 0 && gaps <= 20) {
        // Находим конкретные пропуски
        const present = new Set(numericSuffixes);
        const missing: number[] = [];
        for (let i = min; i <= max; i++) {
          if (!present.has(i)) {
            missing.push(i);
          }
        }
        console.log(`  Пропущенные номера: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '...' : ''}`);
      }
    }
  }
  
  // Сохраняем детальный отчет
  const report = {
    total: codes.length,
    regions: Object.keys(byRegion).length,
    byRegion: regionStats,
    lengthStats,
  };
  
  await fs.writeFile(
    path.join(process.cwd(), 'data', 'analysis_report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
  
  console.log('\n✅ Отчет сохранен в data/analysis_report.json');
}

analyzeGaps().catch(console.error);
