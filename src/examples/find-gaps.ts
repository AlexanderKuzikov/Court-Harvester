// src/examples/find-gaps.ts
import { promises as fs } from 'fs';
import path from 'path';

interface CourtData {
  code: string;
  name: string;
  court_type: string;
}

interface GapInfo {
  prefix: string;
  region: string;
  type: string;
  minNum: number;
  maxNum: number;
  totalFound: number;
  expectedTotal: number;
  gaps: string[];
}

async function findGaps() {
  console.log('\n🔍 Поиск пропусков в кодах судов\n');
  
  // Загружаем данные
  const filepath = path.join(process.cwd(), 'data', 'courts_full_phase4.json');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  const courts: CourtData[] = data.courts;
  
  console.log(`✅ Загружено судов: ${courts.length}\n`);
  
  // Извлекаем и сортируем коды
  const codes = courts.map(c => c.code).sort();
  
  console.log('=== Примеры кодов ===');
  console.log(codes.slice(0, 10).join(', '));
  console.log(`\n`);
  
  // Группируем по префиксу XXBB
  const byPrefix = new Map<string, Set<number>>();
  
  for (const code of codes) {
    if (code.length < 6) {
      console.log(`⚠️  Пропускаем код неправильного формата: ${code}`);
      continue;
    }
    
    const region = code.substring(0, 2);   // XX
    const type = code.substring(2, 4);     // BB
    const numStr = code.substring(4);      // YYYY (может быть разной длины)
    const num = parseInt(numStr, 10);
    
    if (isNaN(num)) {
      console.log(`⚠️  Не удалось распарсить номер в коде: ${code}`);
      continue;
    }
    
    const prefix = region + type;
    
    if (!byPrefix.has(prefix)) {
      byPrefix.set(prefix, new Set());
    }
    byPrefix.get(prefix)!.add(num);
  }
  
  console.log(`✅ Найдено уникальных префиксов XXBB: ${byPrefix.size}\n`);
  
  // Извлекаем уникальные регионы и типы
  const regions = new Set<string>();
  const types = new Set<string>();
  
  for (const prefix of byPrefix.keys()) {
    regions.add(prefix.substring(0, 2));
    types.add(prefix.substring(2, 4));
  }
  
  console.log(`📍 Уникальных регионов (XX): ${regions.size}`);
  console.log(`   ${Array.from(regions).sort().join(', ')}`);
  console.log(`\n🏛️  Уникальных типов (BB): ${types.size}`);
  console.log(`   ${Array.from(types).sort().join(', ')}`);
  console.log(`\n`);
  
  // Анализируем пропуски для каждого префикса
  const gapsReport: GapInfo[] = [];
  let totalGaps = 0;
  
  console.log('=== Анализ пропусков по префиксам ===\n');
  
  for (const [prefix, numbers] of Array.from(byPrefix.entries()).sort()) {
    const sorted = Array.from(numbers).sort((a, b) => a - b);
    const minNum = sorted[0];
    const maxNum = sorted[sorted.length - 1];
    const expectedTotal = maxNum - minNum + 1;
    const actualTotal = sorted.length;
    const gapsCount = expectedTotal - actualTotal;
    
    if (gapsCount === 0) {
      continue; // Нет пропусков
    }
    
    // Находим конкретные пропуски
    const present = new Set(sorted);
    const gaps: string[] = [];
    
    for (let i = minNum; i <= maxNum; i++) {
      if (!present.has(i)) {
        // Форматируем номер с ведущими нулями (4 цифры)
        const formattedNum = String(i).padStart(4, '0');
        gaps.push(prefix + formattedNum);
      }
    }
    
    totalGaps += gaps.length;
    
    gapsReport.push({
      prefix,
      region: prefix.substring(0, 2),
      type: prefix.substring(2, 4),
      minNum,
      maxNum,
      totalFound: actualTotal,
      expectedTotal,
      gaps,
    });
    
    console.log(`${prefix}: диапазон [${minNum}-${maxNum}], найдено ${actualTotal}/${expectedTotal}, пропусков: ${gaps.length}`);
    
    if (gaps.length > 0 && gaps.length <= 10) {
      console.log(`  🔴 Пропущенные: ${gaps.join(', ')}`);
    } else if (gaps.length > 10) {
      console.log(`  🔴 Пропущенные (первые 10): ${gaps.slice(0, 10).join(', ')}...`);
    }
  }
  
  console.log(`\n✅ Итого пропусков найдено: ${totalGaps}`);
  
  // Сохраняем отчет
  const reportPath = path.join(process.cwd(), 'data', 'gaps_report.json');
  await fs.writeFile(
    reportPath,
    JSON.stringify({
      totalGaps,
      prefixes: byPrefix.size,
      regions: Array.from(regions).sort(),
      types: Array.from(types).sort(),
      gaps: gapsReport,
    }, null, 2),
    'utf-8'
  );
  
  console.log(`\n💾 Отчет сохранен: ${reportPath}`);
  
  // Сохраняем список пропущенных кодов для фазы 5
  const allGaps = gapsReport.flatMap(g => g.gaps);
  const gapsListPath = path.join(process.cwd(), 'data', 'missing_codes.json');
  await fs.writeFile(
    gapsListPath,
    JSON.stringify(allGaps, null, 2),
    'utf-8'
  );
  
  console.log(`💾 Список пропусков сохранен: ${gapsListPath} (${allGaps.length} кодов)`);
  console.log(`\n✅ Готово!\n`);
}

findGaps().catch(console.error);
