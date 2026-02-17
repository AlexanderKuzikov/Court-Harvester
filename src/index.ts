#!/usr/bin/env node
import { Command } from 'commander';
import 'dotenv/config';

/**
 * CLI точка входа для Court-Harvester
 * TODO: Реализовать harvesting логику
 */

const program = new Command();

program
  .name('court-harvester')
  .description('CLI-утилита для сбора справочника судов РФ через API DaData')
  .version('0.1.0');

program
  .command('harvest')
  .description('Запустить сбор данных о судах')
  .option('-r, --region <code>', 'Код региона (например, 59 для Пермского края)')
  .option('-f, --full', 'Собрать все регионы')
  .option('-o, --output <path>', 'Путь для сохранения результатов', './data')
  .action((options) => {
    console.log('\n🌾 Court-Harvester v0.1.0\n');
    console.log('⚠️  TODO: Harvesting логика еще не реализована');
    console.log('\nОпции:', options);
    console.log('\n👉 Для тестирования ApiClient используйте:');
    console.log('   npm run example:test-client\n');
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
