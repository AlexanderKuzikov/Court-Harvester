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
  debug?: boolean;
}

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

  // Карта регионов и городов для поиска
  private readonly REGION_SEARCH_QUERIES: Record<string, string[]> = {
    '59': [
      'Пермь суд',
      'Пермский край',
      'Березники',
      'Соликамск',
      'Кунгур',
      'Чайковский',
      'Лысьва',
      'Краснокамск',
    ],
  };

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
    const queries = this.REGION_SEARCH_QUERIES[this.config.regionCode];

    if (!queries) {
      throw new Error(`Нет поисковых запросов для региона ${this.config.regionCode}`);
    }

    console.log(`🔍 Поиск судов по ${queries.length} запросам...\n`);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      this.reportProgress(i + 1, queries.length, `Поиск "${query}"`);
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

  private async searchByQuery(query: string): Promise<void> {
    try {
      // Без фильтра region_code - он не работает!
      const response = await this.apiClient.suggestCourt(query, {
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
   */
  private belongsToRegion(court: CourtData): boolean {
    // Проверка на null
    if (!court.code) {
      return false;
    }

    // Основной способ: код суда
    if (court.code.startsWith(this.config.regionCode)) {
      return true;
    }

    // Запасной способ: поиск по адресу
    const regionNames: Record<string, string[]> = {
      '59': ['Перм', 'перм'],
      '77': ['Москв', 'москв'],
      '78': ['Санкт-Петербург', 'санкт'],
    };

    const names = regionNames[this.config.regionCode];
    if (names && court.address) {
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
