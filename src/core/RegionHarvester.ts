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
  batchDelay?: number;
  debug?: boolean; // включить debug-логирование
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
  private courts: Map<string, CourtData>;
  private filteredOutCount: number = 0;
  private receivedCount: number = 0;
  private onProgress?: (current: number, total: number, message: string) => void;

  private readonly COURT_TYPES: CourtType[] = [
    'RS',
    'MS',
    'AS',
    'OS',
    'KJ',
    'AJ',
    'GV',
    'OV',
  ];

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
      debug: config.debug || false,
    };
    this.courts = new Map();
  }

  setProgressCallback(callback: (current: number, total: number, message: string) => void): void {
    this.onProgress = callback;
  }

  async harvest(): Promise<HarvestResult> {
    console.log(`\n🌾 Запуск сбора судов для региона ${this.config.regionCode}\n`);

    const startTime = Date.now();
    let currentStep = 0;
    const totalSteps = this.COURT_TYPES.length + this.SEARCH_QUERIES.length;

    console.log('🔍 Шаг 1: Поиск по типам судов...');
    for (const courtType of this.COURT_TYPES) {
      currentStep++;
      this.reportProgress(currentStep, totalSteps, `Поиск ${courtType}`);
      await this.searchByType(courtType);
      await this.delay(this.config.batchDelay);
    }

    console.log('\n🔍 Шаг 2: Поиск по ключевым словам...');
    for (const query of this.SEARCH_QUERIES) {
      currentStep++;
      this.reportProgress(currentStep, totalSteps, `Поиск "${query}"`);
      await this.searchByQuery(query);
      await this.delay(this.config.batchDelay);
    }

    console.log('\n💾 Сохранение результатов...');
    await this.saveResults();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const apiStats = this.apiClient.getStats();

    const result: HarvestResult = {
      regionCode: this.config.regionCode,
      totalCourts: this.receivedCount,
      uniqueCourts: this.courts.size,
      duplicates: this.receivedCount - this.courts.size - this.filteredOutCount,
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
    console.log(`📡 Получено от API: ${result.totalCourts}`);
    console.log(`📊 Уникальных судов региона ${this.config.regionCode}: ${result.uniqueCourts}`);
    console.log(`🚫 Отфильтровано (другие регионы): ${result.filteredOut}`);
    console.log(`🔁 Дубликатов: ${result.duplicates}`);
    console.log(`📡 API запросов: ${result.apiStats.totalRequests}`);

    return result;
  }

  private async searchByType(courtType: CourtType): Promise<void> {
    try {
      const response = await this.apiClient.suggestCourt('', {
        region_code: this.config.regionCode,
        court_type: courtType,
        count: 20,
      });

      if (this.config.debug && response.suggestions.length > 0) {
        console.log(`\n[DEBUG] ${courtType}: получено ${response.suggestions.length} судов`);
        console.log('[DEBUG] Примеры кодов:', response.suggestions.slice(0, 3).map(s => s.data.code).join(', '));
      }

      this.addCourts(response.suggestions.map(s => s.data));
    } catch (error) {
      console.error(`⚠️  Ошибка при поиске ${courtType}:`, error);
    }
  }

  private async searchByQuery(query: string): Promise<void> {
    try {
      const response = await this.apiClient.suggestCourt(query, {
        region_code: this.config.regionCode,
        count: 20,
      });

      if (this.config.debug && response.suggestions.length > 0) {
        console.log(`\n[DEBUG] "${query}": получено ${response.suggestions.length} судов`);
        console.log('[DEBUG] Примеры кодов:', response.suggestions.slice(0, 3).map(s => s.data.code).join(', '));
      }

      this.addCourts(response.suggestions.map(s => s.data));
    } catch (error) {
      console.error(`⚠️  Ошибка при поиске "${query}":`, error);
    }
  }

  private addCourts(courts: CourtData[]): void {
    for (const court of courts) {
      this.receivedCount++;

      // Фильтр по региону
      if (!this.belongsToRegion(court)) {
        this.filteredOutCount++;
        if (this.config.debug) {
          console.log(`[DEBUG] Отфильтрован: ${court.code} - ${court.name.substring(0, 50)}...`);
        }
        continue;
      }

      // Дедупликация
      if (!this.courts.has(court.code)) {
        this.courts.set(court.code, court);
        if (this.config.debug) {
          console.log(`[DEBUG] Добавлен: ${court.code} - ${court.name.substring(0, 50)}...`);
        }
      }
    }
  }

  /**
   * Проверяет принадлежность суда к региону
   * Проверяем:
   * 1. Код суда начинается с кода региона (59RS0001)
   * 2. Адрес содержит название региона (запасной вариант)
   */
  private belongsToRegion(court: CourtData): boolean {
    // Основной способ: код суда
    if (court.code.startsWith(this.config.regionCode)) {
      return true;
    }

    // Запасной способ: поиск по адресу
    // Для Пермского края (59) - "Перм"
    const regionNames: Record<string, string[]> = {
      '59': ['Перм', 'Пермск'],
      '77': ['Москв'],
      '78': ['Санкт-Петербург'],
    };

    const names = regionNames[this.config.regionCode];
    if (names) {
      const address = court.address.toLowerCase();
      return names.some(name => address.includes(name.toLowerCase()));
    }

    return false;
  }

  private async saveResults(): Promise<void> {
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

  private getStatsByType(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const court of this.courts.values()) {
      const type = court.court_type;
      stats[type] = (stats[type] || 0) + 1;
    }
    return stats;
  }

  private reportProgress(current: number, total: number, message: string): void {
    if (this.onProgress) {
      this.onProgress(current, total, message);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getCourts(): CourtData[] {
    return Array.from(this.courts.values());
  }
}
