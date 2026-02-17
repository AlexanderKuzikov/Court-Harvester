import { promises as fs } from 'fs';
import path from 'path';

interface Court {
  code: string;
  name: string;
  region_code?: string;
  [key: string]: any;
}

async function main() {
  console.log('\n📊 Анализ регионов\n');

  const dbPath = path.join(process.cwd(), 'data', 'courts_full_phase8.json');
  const data = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
  const courts: Court[] = data.courts;

  // Группируем по регионам
  const byRegion = new Map<string, Court[]>();
  
  for (const court of courts) {
    const region = court.code.substring(0, 2);
    if (!byRegion.has(region)) {
      byRegion.set(region, []);
    }
    byRegion.get(region)!.push(court);
  }

  // Сортируем по количеству судов
  const regionStats = Array.from(byRegion.entries())
    .map(([region, courts]) => ({
      region,
      count: courts.length,
      codes: courts.map(c => c.code).sort(),
    }))
    .sort((a, b) => b.count - a.count);

  console.log('🏆 ТОП-20 регионов по количеству судов:\n');
  
  regionStats.slice(0, 20).forEach((stat, index) => {
    const regionNum = parseInt(stat.region, 10);
    const regionName = getRegionName(regionNum);
    console.log(`${index + 1}. Регион ${stat.region} (${regionName}): ${stat.count} судов`);
  });

  console.log('\n\n📋 Детальная статистика по префиксам в топ-20:\n');

  for (const stat of regionStats.slice(0, 20)) {
    console.log(`\n📍 Регион ${stat.region} (${getRegionName(parseInt(stat.region))}): ${stat.count} судов`);
    
    // Группируем по типам судов
    const byType = new Map<string, { codes: string[]; max: number }>();
    
    for (const code of stat.codes) {
      const type = code.substring(2, 4);
      const num = parseInt(code.substring(4), 10);
      
      if (!byType.has(type)) {
        byType.set(type, { codes: [], max: 0 });
      }
      
      const entry = byType.get(type)!;
      entry.codes.push(code);
      if (num > entry.max) {
        entry.max = num;
      }
    }

    // Выводим по типам
    Array.from(byType.entries())
      .sort((a, b) => b[1].codes.length - a[1].codes.length)
      .forEach(([type, data]) => {
        console.log(`  ${stat.region}${type}: ${data.codes.length} судов, MAX=${data.max}`);
      });
  }

  // Статистика по всем регионам
  console.log('\n\n📊 Общая статистика:\n');
  console.log(`Всего регионов: ${byRegion.size}`);
  console.log(`Всего судов: ${courts.length}`);
  console.log(`Средне судов на регион: ${Math.round(courts.length / byRegion.size)}`);
}

function getRegionName(code: number): string {
  const names: { [key: number]: string } = {
    1: 'Адыгея',
    2: 'Башкортостан',
    3: 'Бурятия',
    4: 'Алтай',
    5: 'Дагестан',
    16: 'Татарстан',
    18: 'Удмуртия',
    22: 'Алтайский край',
    23: 'Краснодарский край',
    24: 'Красноярский край',
    25: 'Приморский край',
    26: 'Ставропольский край',
    27: 'Хабаровский край',
    28: 'Амурская',
    34: 'Волгоградская',
    36: 'Воронежская',
    38: 'Иркутская',
    42: 'Кемеровская',
    50: 'Московская',
    52: 'Нижегородская',
    54: 'Новосибирская',
    55: 'Омская',
    59: 'Пермский край',
    61: 'Ростовская',
    63: 'Самарская',
    64: 'Саратовская',
    66: 'Свердловская',
    74: 'Челябинская',
    77: 'Москва',
    78: 'Санкт-Петербург',
    90: 'Запорожская',
    91: 'Крым',
    92: 'Севастополь',
    93: 'Краснодарский (ДНР)',
    94: 'Луганская (ЛНР)',
    96: 'Херсонская',
  };
  
  return names[code] || 'Неизвестный';
}

main().catch(console.error);
