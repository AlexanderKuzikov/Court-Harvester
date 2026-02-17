import { ApiClient } from './ApiClient';
import { CourtData } from '../types/dadata';
import { promises as fs } from 'fs';
import path from 'path';

export interface FullHarvesterConfig {
  outputDir?: string;
  batchDelay?: number;
  debug?: boolean;
  maxDepth?: number;
  checkpointInterval?: number;
}

export interface FullHarvestResult {
  totalCourts: number;
  uniqueCourts: number;
  duplicates: number;
  byRegion: Record<string, number>;
  byType: Record<string, number>;
  timestamp: string;
  queriesExecuted: number;
  detailsExpanded: number;
  apiStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
  };
}

export class FullHarvester {
  private apiClient: ApiClient;
  private config: Required<FullHarvesterConfig>;
  private courts: Map<string, CourtData>;
  private processedQueries: Set<string>;
  private hotPrefixes: Set<string>; // префиксы для детализации
  private queriesExecuted: number = 0;
  private detailsExpanded: number = 0;
  private onProgress?: (current: number, total: number, message: string) => void;

  private readonly ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'.split('');
  private readonly MAX_RESULTS_PER_QUERY = 20;

  constructor(apiClient: ApiClient, config: FullHarvesterConfig = {}) {
    this.apiClient = apiClient;
    this.config = {
      outputDir: config.outputDir || './data',
      batchDelay: config.batchDelay || 100,
      debug: config.debug || false,
      maxDepth: config.maxDepth || 3,
      checkpointInterval: config.checkpointInterval || 100,
    };
    this.courts = new Map();
    this.processedQueries = new Set();
    this.hotPrefixes = new Set();
  }

  setProgressCallback(callback: (current: number, total: number, message: string) => void): void {
    this.onProgress = callback;
  }

  async harvest(): Promise<FullHarvestResult> {
    console.log('\n🌍 Запуск полного сбора всех судов РФ\n');
    console.log(`⚙️  Максимальная глубина детализации: ${this.config.maxDepth}`);
    console.log(`🔤 Чекпоинты каждые ${this.config.checkpointInterval} запросов\n`);

    const startTime = Date.now();

    // Уровень 1: Однобуквенный
    await this.searchByDepth(1);

    // Уровень 2: Двухбуквенный
    if (this.config.maxDepth >= 2) {
      await this.searchByDepth(2);
    }

    // Уровень 3: Только "горячие" префиксы
    if (this.config.maxDepth >= 3 && this.hotPrefixes.size > 0) {
      console.log(`\n🔥 Уровень 3: Детализация ${this.hotPrefixes.size} "горячих" префиксов\n`);
      await this.expandHotPrefixes();
    }

    // Финальное сохранение
    console.log('\n💾 Сохранение финальных результатов...');
    await this.saveResults('courts_full.json');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const apiStats = this.apiClient.getStats();

    const result: FullHarvestResult = {
      totalCourts: this.queriesExecuted * this.MAX_RESULTS_PER_QUERY,
      uniqueCourts: this.courts.size,
      duplicates: (this.queriesExecuted * this.MAX_RESULTS_PER_QUERY) - this.courts.size,
      byRegion: this.getStatsByRegion(),
      byType: this.getStatsByType(),
      timestamp: new Date().toISOString(),
      queriesExecuted: this.queriesExecuted,
      detailsExpanded: this.detailsExpanded,
      apiStats: {
        totalRequests: apiStats.totalRequests,
        successfulRequests: apiStats.successfulRequests,
        failedRequests: apiStats.failedRequests,
      },
    };

    console.log(`\n✅ Сбор завершён за ${duration}с`);
    console.log(`📊 Уникальных судов: ${result.uniqueCourts}`);
    console.log(`🔁 Дубликатов: ${result.duplicates}`);
    console.log(`🔍 Запросов выполнено: ${result.queriesExecuted}`);
    console.log(`🔥 "Горячих" префиксов: ${this.hotPrefixes.size}`);
    console.log(`\n🌍 Покрытие по регионам: ${Object.keys(result.byRegion).length} регионов`);

    return result;
  }

  private async searchByDepth(depth: number): Promise<void> {
    const queries = this.generateQueries(depth);
    console.log(`\n🔍 Уровень ${depth}: генерируем ${queries.length} запросов...\n`);

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      if (this.processedQueries.has(query)) {
        continue;
      }

      this.reportProgress(i + 1, queries.length, `Уровень ${depth}: "${query}"`);
      
      const count = await this.searchAndAdd(query);
      this.processedQueries.add(query);

      // Если получили MAX - помечаем как "горячий"
      if (count === this.MAX_RESULTS_PER_QUERY && depth === 2) {
        this.hotPrefixes.add(query);
        this.detailsExpanded++;
        if (this.config.debug) {
          console.log(`  🔥 "${query}" вернул ${count} - помечен для детализации`);
        }
      }

      // Чекпоинт
      if (this.queriesExecuted % this.config.checkpointInterval === 0) {
        await this.saveCheckpoint();
      }

      await this.delay(this.config.batchDelay);
    }
  }

  /**
   * Детализация "горячих" префиксов
   */
  private async expandHotPrefixes(): Promise<void> {
    const hotArray = Array.from(this.hotPrefixes);
    const totalQueries = hotArray.length * this.ALPHABET.length;
    
    console.log(`📊 Ожидаемый объём: ${totalQueries} запросов\n`);

    let executed = 0;
    for (const prefix of hotArray) {
      for (const letter of this.ALPHABET) {
        const query = prefix + letter;
        
        if (this.processedQueries.has(query)) {
          continue;
        }

        executed++;
        this.reportProgress(executed, totalQueries, `Детализация: "${query}"`);
        
        await this.searchAndAdd(query);
        this.processedQueries.add(query);

        // Чекпоинт
        if (this.queriesExecuted % this.config.checkpointInterval === 0) {
          await this.saveCheckpoint();
        }

        await this.delay(this.config.batchDelay);
      }
    }
  }

  private generateQueries(depth: number): string[] {
    if (depth === 1) {
      return this.ALPHABET;
    }

    const queries: string[] = [];
    const base = this.generateQueries(depth - 1);

    for (const prefix of base) {
      for (const letter of this.ALPHABET) {
        queries.push(prefix + letter);
      }
    }

    return queries;
  }

  private async searchAndAdd(query: string): Promise<number> {
    try {
      const response = await this.apiClient.suggestCourt(query, {
        count: this.MAX_RESULTS_PER_QUERY,
      });

      this.queriesExecuted++;

      if (this.config.debug && response.suggestions.length > 0) {
        console.log(`  "${query}": ${response.suggestions.length} рез-в`);
      }

      for (const suggestion of response.suggestions) {
        const court = suggestion.data;
        
        if (!court.code) {
          continue;
        }
        
        if (!this.courts.has(court.code)) {
          this.courts.set(court.code, court);
        }
      }

      return response.suggestions.length;
    } catch (error) {
      console.error(`⚠️  Ошибка при запросе "${query}":`, error);
      return 0;
    }
  }

  private async saveCheckpoint(): Promise<void> {
    await this.saveResults('courts_checkpoint.json');
    console.log(`\n🔤 Чекпоинт: ${this.courts.size} судов, ${this.queriesExecuted} запросов\n`);
  }

  private async saveResults(filename: string): Promise<void> {
    await fs.mkdir(this.config.outputDir, { recursive: true });
    const outputPath = path.join(this.config.outputDir, filename);
    const courtsArray = Array.from(this.courts.values());

    const output = {
      meta: {
        totalCourts: courtsArray.length,
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        queriesExecuted: this.queriesExecuted,
        byRegion: this.getStatsByRegion(),
        byType: this.getStatsByType(),
      },
      courts: courtsArray,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    
    if (this.config.debug) {
      console.log(`💾 Сохранено: ${outputPath}`);
    }
  }

  private getStatsByRegion(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const court of this.courts.values()) {
      if (!court.code) {
        continue;
      }
      
      const regionCode = court.code.substring(0, 2);
      stats[regionCode] = (stats[regionCode] || 0) + 1;
    }
    return stats;
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

    async loadFromFile(filename: string): Promise<void> {
    try {
      const filepath = path.join(this.config.outputDir, filename);
      const data = await promises.readFile(filepath, 'utf-8');
      const json = JSON.parse(data);
      
      if (json.courts && Array.isArray(json.courts)) {
        this.courts = new Map(json.courts.map((c: any) => [c.id, c]));
        console.log(`✅ Загружено ${this.courts.size} судов из ${filename}`);
      }
    } catch (error) {
      console.error(`⚠️  Файл ${filename} не найден, начинаем с пустого набора`);
      this.courts = new Map();
    }
  }

    async runExtraQueries(queries: string[]): Promise<void> {
    console.log(`\n🔍 Пускаем дополнительные ${queries.length} запросы...\n`);
    
    for (const query of queries) {
            const response = await this.apiClient.suggestCourt(query);
            const results = response.suggestions || [];
      
      for (const court of results) {
        if (!this.courts.has(court.id)) {
          this.courts.set(court.id, court);
          this.onProgress?.(this.courts.size, queries.length, `Added: ${court.name}`);
        }
      }
      
      await this.delay(this.config.batchDelay);
    }
    
    console.log(`\n✅ Готово! Всего уникальных судов: ${this.courts.size}\n`);
    
    // Сохраняем результаты фазы 4
    await this.saveResults();
  }
  }

    
