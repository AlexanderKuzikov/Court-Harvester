#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';
import { ApiClient } from './core/ApiClient';
import { RegionHarvester } from './core/RegionHarvester';

/**
 * CLI точка входа для Court-Harvester
 */

const program = new Command();

program
  .name('court-harvester')
  .description('CLI-утилита для сбора справочника судов РФ через API DaData')
  .version('0.1.0');

program
  .command('harvest')
  .description('Запустить сбор данных о судах')
  .option('-r, --region <code>', 'Код региона (например, 59 для Пермского края)', '59')
  .option('-o, --output <path>', 'Директория для сохранения результатов', './data')
  .action(async (options) => {
    console.log('\n🌾 Court-Harvester v0.1.0\n');

    // Проверка наличия API ключей
    const apiKey = process.env.DADATA_API_KEY;
    const secretKey = process.env.DADATA_SECRET_KEY;

    if (!apiKey) {
      console.error('❌ Ошибка: Не найден DADATA_API_KEY в .env файле');
      console.error('Пожалуйста, создайте .env файл из .env.example\n');
      process.exit(1);
    }

    try {
      // Инициализация API клиента
      const apiClient = new ApiClient({
        apiKey,
        secretKey,
      });

      // Инициализация харвестера
      const harvester = new RegionHarvester(apiClient, {
        regionCode: options.region,
        outputDir: options.output,
      });

      // Простой progress callback
      harvester.setProgressCallback((current, total, message) => {
        const percent = ((current / total) * 100).toFixed(0);
        console.log(`[■${"■".repeat(current)}${" ".repeat(total - current)}] ${percent}% - ${message}`);
      });

      // Запуск сбора
      const result = await harvester.harvest();

      // Вывод детальной статистики
      console.log('\n📊 Статистика по типам судов:');
      for (const [type, count] of Object.entries(result.byType)) {
        console.log(`  ${type}: ${count}`);
      }

      // Graceful shutdown
      await apiClient.shutdown();

      console.log('\n✅ Готово! Результаты сохранены в ' + options.output + '\n');
    } catch (error) {
      console.error('\n❌ Ошибка при сборе:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Экспортировать собранные данные')
  .option('-f, --format <type>', 'Формат экспорта (json, csv, xlsx)', 'json')
  .option('-o, --output <path>', 'Имя выходного файла', 'courts.json')
  .action((options) => {
    console.log('\n📊 Экспорт данных\n');
    console.log('⚠️  TODO: Export логика еще не реализована');
    console.log('\nОпции:', options);
  });

program.parse();
