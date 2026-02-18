import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'courts_updated_2026-02-18.json');
  const data = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
  const courts: any[] = data.courts;

  console.log(`\n✅ Загружено судов: ${courts.length}\n`);

  // ──────────────────────────────────────────
  // Анализ 1: MAX по каждому типу
  // ──────────────────────────────────────────
  console.log('🔍 Анализ 1: MAX номер по каждому типу суда...');
  const types = ['RS', 'MS', 'AS', 'OS', 'GV', 'OV', 'KV', 'AV', 'KJ', 'AJ', 'AA', 'AO', 'VS', 'AI'];
  for (const type of types) {
    const nums = courts
      .filter((c: any) => c.code.substring(2, 4) === type)
      .map((c: any) => parseInt(c.code.substring(4), 10));
    if (nums.length === 0) {
      console.log(`  ${type}: нет судов`);
    } else {
      const max = Math.max(...nums);
      const maxCourt = courts.find((c: any) =>
        c.code.substring(2, 4) === type && parseInt(c.code.substring(4), 10) === max
      );
      console.log(`  ${type}: MAX=${String(max).padStart(4, '0')} | ${maxCourt?.code} | ${maxCourt?.name}`);
    }
  }

  // ──────────────────────────────────────────
  // Анализ 2: Суды с номером 0000 в базе
  // ──────────────────────────────────────────
  console.log('\n🔍 Анализ 2: Суды с номером 0000 в базе...');
  const zeroCourts = courts.filter((c: any) => c.code.endsWith('0000'));
  if (zeroCourts.length === 0) {
    console.log('  ❌ Ни одного суда с номером 0000 в базе!');
  } else {
    for (const c of zeroCourts) {
      console.log(`  ✅ ${c.code} | ${c.name}`);
    }
  }
  console.log(`\n  📊 Итого судов с 0000: ${zeroCourts.length}`);

  // ──────────────────────────────────────────
  // Анализ 3: Регионы 90-99 в базе
  // ──────────────────────────────────────────
  console.log('\n🔍 Анализ 3: Статистика по регионам 90-99...');
  for (let r = 90; r <= 99; r++) {
    const region = String(r);
    const regionCourts = courts.filter((c: any) => c.code.startsWith(region));
    if (regionCourts.length > 0) {
      const byType = new Map<string, number>();
      for (const c of regionCourts) {
        const t = c.code.substring(2, 4);
        byType.set(t, (byType.get(t) ?? 0) + 1);
      }
      const breakdown = Array.from(byType.entries()).map(([t, n]) => `${t}:${n}`).join(' ');
      console.log(`  Регион ${region}: ${regionCourts.length} судов | ${breakdown}`);
    } else {
      console.log(`  Регион ${region}: пусто`);
    }
  }

  // ──────────────────────────────────────────
  // Анализ 4: Регион 00 в базе
  // ──────────────────────────────────────────
  console.log('\n🔍 Анализ 4: Регион 00 в базе...');
  const region00 = courts.filter((c: any) => c.code.startsWith('00'));
  if (region00.length === 0) {
    console.log('  ❌ Судов с регионом 00 нет в базе!');
  } else {
    for (const c of region00) {
      console.log(`  ✅ ${c.code} | ${c.name}`);
    }
  }

  console.log('');
}

main().catch(console.error);