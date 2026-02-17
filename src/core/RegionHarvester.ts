import { ApiClient } from './ApiClient';
import { CourtData, CourtType } from '../types/dadata';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Конфигурация харвестера
 */
export interface HarvesterConfig {
  regionCode: string;
  outputDir?: string;
  batchDelay?: number; // задержка между батчами (мс)
}

/**
 * Результат сбора
 */
export interface HarvestResult {
  regionCode: string;
  totalCourts: number;
  uniqueCourts: number;
  duplicates: number;
  filteredOut: number;
  byType: Record<string, number>;
  timestamp: string;
  apiStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
  };
}

/**
 * Харвестер для сбора судов по региону
 */
export class RegionHarvester {
  private apiClient: ApiClient;
  private config: Required<HarvesterConfig>;
  private courts: Map<string, CourtData>; // key = court code
  private filteredOutCount: number = 0; // отфильтровано по региону
  private onProgress?: (current: number, total: number, message: string) => void;

  // Стратегия: типы судов для поиска
  private readonly COURT_TYPES: CourtType[] = [
    'RS', // Районный, городской
    'MS', // Мировой суд
    'AS', // Арбитражный субъекта
    'OS', // Областной
    'KJ', // Кассационный общей юрисдикции
    'AJ', // Апелляционный общей юрисдикции
    'GV', // Гарнизонный военный
    'OV', // Окружной военный
  ];

  // Ключевые слова для поиска
  private readonly SEARCH_QUERIES = [
    'суд',
    'мировой',
    'арбитраж',
    'районный',
  ];

  constructor(apiClient: ApiClient, config: HarvesterConfig) {
    this.apiClient = apiClient;
    this.config = {
      regionCode: config.regionCode,
      outputDir: config.outputDir || './data',
      batchDelay: config.batchDelay || 100,
    };
    this.courts = new Map();
  }

  /**
   * Установить callback для отслеживания прогресса
   */
  setProgressCallback(callback: (current: number, total: number, message: string) => void): void {
    this.onProgress = callback;
  }

  /**
   * Запустить сбор судов по региону
   */
  async harvest(): Promise<HarvestResult> {
    console.log(`\n🌾 Запуск сбора судов для региона ${this.config.regionCode}\n`);

    const startTime = Date.now();
    let currentStep = 0;
    const totalSteps = this.COURT_TYPES.length + this.SEARCH_QUERIES.length;

    // Шаг 1: Поиск по типам судов
    console.log('🔍 Шаг 1: Поиск по типам судов...');
    for (const courtType of this.COURT_TYPES) {
      currentStep++;
      this.reportProgress(currentStep, totalSteps, `Поиск ${courtType}`);

      await this.searchByType(courtType);
      await this.delay(this.config.batchDelay);
    }

    // Шаг 2: Поиск по ключевым словам
    console.log('\n🔍 Шаг 2: Поиск по ключевым словам...');
    for (const query of this.SEARCH_QUERIES) {
      currentStep++;
      this.reportProgress(currentStep, totalSteps, `Поиск "${query}"`);

      await this.searchByQuery(query);
      await this.delay(this.config.batchDelay);
    }

    // Сохранение результатов
    console.log('\n💾 Сохранение результатов...');
    await this.saveResults();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const apiStats = this.apiClient.getStats();

    const result: HarvestResult = {
      regionCode: this.config.regionCode,
      totalCourts: apiStats.successfulRequests * 10, // приблизительно
      uniqueCourts: this.courts.size,
      duplicates: apiStats.successfulRequests * 10 - this.courts.size - this.filteredOutCount,
      filteredOut: this.filteredOutCount,
      byType: this.getStatsByType(),
      timestamp: new Date().toISOString(),
      apiStats: {
        totalRequests: apiStats.totalRequests,
        successfulRequests: apiStats.successfulRequests,
        failedRequests: apiStats.failedRequests,
      },
    };

    console.log(`\n✅ Сбор завершен за ${duration}с`);
    console.log(`📊 Уникальных судов региона ${this.config.regionCode}: ${result.uniqueCourts}`);
    console.log(`🚫 Отфильтровано (другие регионы): ${result.filteredOut}`);
    console.log(`🔁 Дубликатов отфильтровано: ${result.duplicates}`);
    console.log(`📡 API запросов: ${result.apiStats.totalRequests}`);

    return result;
  }

  /**
   * Поиск по типу суда
   */
  private async searchByType(courtType: CourtType): Promise<void> {
    try {
      const response = await this.apiClient.suggestCourt('', {
        region_code: this.config.regionCode,
        court_type: courtType,
        count: 20,
      });

      this.addCourts(response.suggestions.map(s => s.data));
    } catch (error) {
      console.error(`⚠️  Ошибка при поиске ${courtType}:`, error);
    }
  }

  /**
   * Поиск по ключевому слову
   */
  private async searchByQuery(query: string): Promise<void> {
    try {
      const response = await this.apiClient.suggestCourt(query, {
        region_code: this.config.regionCode,
        count: 20,
      });

      this.addCourts(response.suggestions.map(s => s.data));
    } catch (error) {
      console.error(`⚠️  Ошибка при поиске "${query}":`, error);
    }
  }

  /**
   * Добавить суды с дедупликацией и фильтрацией по региону
   */
  private addCourts(courts: CourtData[]): void {
    for (const court of courts) {
      // Фильтруем по региону: код суда должен начинаться с кода региона
      if (!this.belongsToRegion(court)) {
        this.filteredOutCount++;
        continue;
      }

      // Дедупликация
      if (!this.courts.has(court.code)) {
        this.courts.set(court.code, court);
      }
    }
  }

  /**
   * Проверяет, принадлежит ли суд указанному региону
   */
  private belongsToRegion(court: CourtData): boolean {
    // Код суда начинается с кода региона (например, 59RS0001)
    return court.code.startsWith(this.config.regionCode);
  }

  /**
   * Сохранить результаты в JSON
   */
  private async saveResults(): Promise<void> {
    // Создаем директорию если не существует
    await fs.mkdir(this.config.outputDir, { recursive: true });

    const outputPath = path.join(this.config.outputDir, `courts_${this.config.regionCode}.json`);
    const courtsArray = Array.from(this.courts.values());

    const output = {
      meta: {
        regionCode: this.config.regionCode,
        totalCourts: courtsArray.length,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      },
      courts: courtsArray,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`💾 Сохранено: ${outputPath}`);
  }

  /**
   * Получить статистику по типам
   */
  private getStatsByType(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const court of this.courts.values()) {
      const type = court.court_type;
      stats[type] = (stats[type] || 0) + 1;
    }
    return stats;
  }

  /**
   * Отчет о прогрессе
   */
  private reportProgress(current: number, total: number, message: string): void {
    if (this.onProgress) {
      this.onProgress(current, total, message);
    }
  }

  /**
   * Задержка
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получить собранные суды
   */
  getCourts(): CourtData[] {
    return Array.from(this.courts.values());
  }
}
