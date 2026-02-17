// src/examples/check-min-values.ts
import { promises as fs } from 'fs';
import path from 'path';

async function checkMinValues() {
  console.log('\n📊 Проверка MIN значений для каждого префикса\n');
  
  const filepath = path.join(process.cwd(), 'data', 'courts_full_phase5.json');
  const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));
  const courts = data.courts;
  
  // Группируем по префиксам
  const byPrefix = new Map<string, number[]>();
  
  for (const court of courts) {
    const code = court.code;
    if (!code || code.length < 6) continue;
    
    const prefix = code.substring(0, 4);
    const numStr = code.substring(4);
    const num = parseInt(numStr, 10);
    
    if (isNaN(num)) continue;
    
    if (!byPrefix.has(prefix)) {
      byPrefix.set(prefix, []);
    }
    byPrefix.get(prefix)!.push(num);
  }
  
  console.log(`📌 Всего префиксов: ${byPrefix.size}\n`);
  
  // Анализируем MIN для каждого и генерируем пропущенные коды
  const withGapsBeforeMin: Array<{ 
    prefix: string; 
    min: number; 
    max: number; 
    potentialGap: number;
    missingCodes: string[];
  }> = [];
  
  const allMissingCodes: string[] = [];
  
  for (const [prefix, numbers] of byPrefix.entries()) {
    const sorted = numbers.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    if (min > 1) {
      const missingCodes: string[] = [];
      
      // Генерируем все коды от 0001 до MIN-1
      for (let i = 1; i < min; i++) {
        const code = prefix + String(i).padStart(4, '0');
        missingCodes.push(code);
        allMissingCodes.push(code);
      }
      
      withGapsBeforeMin.push({
        prefix,
        min,
        max,
        potentialGap: min - 1,
        missingCodes,
      });
    }
  }
  
  console.log(`=== Префиксы с MIN > 1 ===\n`);
  console.log(`Найдено: ${withGapsBeforeMin.length}\n`);
  
  if (withGapsBeforeMin.length > 0) {
    console.log('ТОП-30 префиксов с наибольшими пропусками:\n');
    
    withGapsBeforeMin
      .sort((a, b) => b.potentialGap - a.potentialGap)
      .slice(0, 30)
      .forEach(({ prefix, min, max, potentialGap, missingCodes }) => {
        console.log(`${prefix}: MIN=${min}, MAX=${max}, пропуск [1-${min-1}] = ${potentialGap} кодов`);
        if (potentialGap <= 5) {
          console.log(`  📋 Коды: ${missingCodes.join(', ')}`);
        }
      });
    
    const totalPotentialGaps = withGapsBeforeMin.reduce((sum, p) => sum + p.potentialGap, 0);
    console.log(`\n📊 Всего потенциальных пропусков: ${totalPotentialGaps}`);
    console.log(`⚠️  Эти номера НЕ проверялись в предыдущих фазах!\n`);
    
    // Сохраняем список пропущенных кодов для Фазы 7
    const missingPath = path.join(process.cwd(), 'data', 'missing_before_min.json');
    await fs.writeFile(
      missingPath,
      JSON.stringify(allMissingCodes, null, 2),
      'utf-8'
    );
    
    console.log(`💾 Список пропущенных кодов сохранен: ${missingPath}`);
    console.log(`📋 Всего кодов для проверки: ${allMissingCodes.length}\n`);
    
    // Сохраняем детальный отчет
    const reportPath = path.join(process.cwd(), 'data', 'min_gaps_report.json');
    await fs.writeFile(
      reportPath,
      JSON.stringify({
        totalPrefixesWithGaps: withGapsBeforeMin.length,
        totalMissingCodes: allMissingCodes.length,
        prefixes: withGapsBeforeMin,
      }, null, 2),
      'utf-8'
    );
    
    console.log(`💾 Детальный отчет: ${reportPath}\n`);
  } else {
    console.log('✅ Все префиксы начинаются с MIN=1 или MIN=0\n');
    console.log('🎉 Пропусков ниже MIN нет!\n');
  }
}

checkMinValues().catch(console.error);
