import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

async function main() {
  console.log('\n📊 Сортировка и экспорт базы судов\n');

  const inputPath = path.join(process.cwd(), 'data', 'courts_full_final.json');
  const sortedPath = path.join(process.cwd(), 'data', 'courts_full_final_sorted.json');
  const excelPath = path.join(process.cwd(), 'data', 'courts_full_final.xlsx');

  // 1. Загружаем JSON
  console.log('📁 Загрузка JSON...');
  const data = JSON.parse(await fs.readFile(inputPath, 'utf-8'));
  const courts = data.courts;

  console.log(`✅ Загружено судов: ${courts.length}`);

  // 2. Сортируем по code
  console.log('🔄 Сортировка по code...');
  courts.sort((a: any, b: any) => a.code.localeCompare(b.code));

  // 3. Сохраняем отсортированный JSON
  console.log('💾 Сохранение отсортированного JSON...');
  const sortedData = {
    ...data,
    courts,
    meta: {
      ...data.meta,
      sorted: true,
      sortedAt: new Date().toISOString(),
    },
  };
  await fs.writeFile(sortedPath, JSON.stringify(sortedData, null, 2), 'utf-8');

  // 4. Создаём Excel
  console.log('📊 Создание Excel файла...');
  
  // Создаём worksheet из массива объектов
  const worksheet = XLSX.utils.json_to_sheet(courts);
  
  // Создаём workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Courts');
  
  // Автоширина колонок
  const cols = Object.keys(courts[0] || {}).map(key => {
    const maxLength = Math.max(
      key.length,
      ...courts.map((c: any) => String(c[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, 50) }; // Макс 50 символов
  });
  worksheet['!cols'] = cols;
  
  // Сохраняем файл
  XLSX.writeFile(workbook, excelPath);

  console.log('\n✅ Готово!\n');
  console.log(`📊 Всего судов: ${courts.length}`);
  console.log(`📁 JSON:  ${sortedPath}`);
  console.log(`📊 Excel: ${excelPath}`);
  console.log('\n💡 Открывай Excel файл в Excel или LibreOffice\n');
}

main().catch(console.error);
