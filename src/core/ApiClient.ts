import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import {
  DaDataRequest,
  DaDataResponse,
  CourtData,
  CourtType
} from '../types/dadata';

/**
 * Кастомная ошибка для превышения квоты API DaData
 */
export class QuotaExceededError extends Error {
  constructor(message: string = 'DaData API quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

/**
 * Кастомная ошибка для ошибок DaData API
 */
export class DaDataApiError extends Error {
  public statusCode?: number;
  public responseData?: unknown;

  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = 'DaDataApiError';
    this.statusCode = statusCode;
    this.responseData = responseData;
    Object.setPrototypeOf(this, DaDataApiError.prototype);
  }
}

/**
 * Конфигурация API клиента
 */
export interface ApiClientConfig {
  apiKey: string;
  secretKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  rateLimit?: {
    maxConcurrent?: number;
    minTime?: number;
  };
}

/**
 * Статистика работы клиента
 */
export interface ClientStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  quotaErrors: number;
}

/**
 * Клиент для работы с DaData API
 * Реализует rate limiting, retry logic и обработку специфичных ошибок
 */
export class ApiClient {
  private axiosInstance: AxiosInstance;
  private limiter: Bottleneck;
  private config: Required<ApiClientConfig>;
  private stats: ClientStats;

  constructor(config: ApiClientConfig) {
    // Дефолтные значения конфигурации
    this.config = {
      apiKey: config.apiKey,
      secretKey: config.secretKey || config.apiKey,
      baseURL: config.baseURL || 'https://suggestions.dadata.ru/suggestions/api/4_1/rs',
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 3,
      rateLimit: {
        maxConcurrent: config.rateLimit?.maxConcurrent || 5,
        minTime: config.rateLimit?.minTime || 50, // 50ms = 20 запросов/сек
      },
    };

    // Инициализация статистики
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      quotaErrors: 0,
    };

    // Инициализация Axios
    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${this.config.apiKey}`,
        'X-Secret': this.config.secretKey,
      },
    });

    // Настройка axios-retry
    axiosRetry(this.axiosInstance, {
      retries: this.config.maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        // Повторяем только при сетевых ошибках и 5xx
        // НЕ повторяем при 403 (quota) и 4xx клиентских ошибках
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status !== undefined && error.response.status >= 500);
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.warn(
          `[ApiClient] Retry ${retryCount}/${this.config.maxRetries} for ${requestConfig.url}: ${error.message}`
        );
      },
    });

    // Инициализация rate limiter (Bottleneck)
    this.limiter = new Bottleneck({
      maxConcurrent: this.config.rateLimit.maxConcurrent,
      minTime: this.config.rateLimit.minTime,
      reservoir: 20, // начальное количество запросов
      reservoirRefreshAmount: 20,
      reservoirRefreshInterval: 1000, // обновляем каждую секунду
    });

    // Обработка ошибок Bottleneck
    this.limiter.on('error', (error) => {
      console.error('[ApiClient] Bottleneck error:', error);
    });

    this.limiter.on('failed', async (error, jobInfo) => {
      const retryDelay = 200 * (jobInfo.retryCount + 1); // прогрессивная задержка
      if (jobInfo.retryCount < this.config.maxRetries) {
        console.log(`[ApiClient] Retrying job ${jobInfo.options.id}, attempt ${jobInfo.retryCount + 1}`);
        return retryDelay;
      }
    });

    this.limiter.on('depleted', () => {
      console.warn('[ApiClient] Rate limit reservoir depleted, queuing requests...');
    });
  }

  /**
   * Подсказки по судам через DaData API
   * 
   * @param query - Поисковый запрос (название, регион, код)
   * @param options - Дополнительные параметры запроса
   * @returns Массив подсказок судов
   * @throws {QuotaExceededError} Когда превышена квота API
   * @throws {DaDataApiError} При других ошибках API
   */
  async suggestCourt(
    query: string,
    options?: {
      count?: number;
      region_code?: string;
      court_type?: CourtType | CourtType[];
    }
  ): Promise<DaDataResponse<CourtData>> {
    // Подготовка тела запроса согласно твоим типам
    const requestBody: DaDataRequest = {
      query,
      count: options?.count || 10,
    };

    // Добавляем locations для фильтрации по региону
    if (options?.region_code) {
      requestBody.locations = [{ region_code: options.region_code }];
    }

    // Добавляем фильтры по типу суда
    if (options?.court_type) {
      requestBody.filters = [{ court_type: options.court_type }];
    }

    // Инкрементируем счетчик запросов
    this.stats.totalRequests++;

    // Выполняем запрос через rate limiter
    return this.limiter.schedule({ id: `court-${Date.now()}` }, async () => {
      try {
        const response = await this.axiosInstance.post<DaDataResponse<CourtData>>(
          '/suggest/court',
          requestBody
        );

        this.stats.successfulRequests++;
        return response.data;
      } catch (error) {
        this.stats.failedRequests++;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError<{ message?: string; detail?: string }>;

          // Обработка превышения квоты (403 Forbidden)
          if (axiosError.response?.status === 403) {
            this.stats.quotaErrors++;
            
            const errorMsg = axiosError.response?.data?.message || 
                           axiosError.response?.data?.detail ||
                           'DaData API quota exceeded. Daily limit (10,000 requests) reached.';
            
            throw new QuotaExceededError(errorMsg);
          }

          // Обработка других HTTP ошибок
          const statusCode = axiosError.response?.status;
          const errorMessage = axiosError.response?.data?.message || 
                              axiosError.response?.data?.detail ||
                              axiosError.message || 
                              'Unknown DaData API error';

          throw new DaDataApiError(
            `[${statusCode || 'NETWORK'}] ${errorMessage}`,
            statusCode,
            axiosError.response?.data
          );
        }

        // Прокидываем неизвестные ошибки
        throw error;
      }
    });
  }

  /**
   * Получить текущее состояние rate limiter
   */
  getLimiterStatus() {
    return {
      running: this.limiter.counts().RUNNING,
      queued: this.limiter.counts().QUEUED,
      done: this.limiter.counts().DONE,
    };
  }

  /**
   * Получить статистику работы клиента
   */
  getStats(): ClientStats {
    return { ...this.stats };
  }

  /**
   * Сбросить статистику
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      quotaErrors: 0,
    };
  }

  /**
   * Очистить очередь rate limiter
   */
  async clearQueue(): Promise<void> {
    await this.limiter.stop({ dropWaitingJobs: true });
    console.log('[ApiClient] Queue cleared');
  }

  /**
   * Graceful shutdown клиента
   */
  async shutdown(): Promise<void> {
    console.log('[ApiClient] Shutting down...');
    await this.limiter.stop();
    console.log('[ApiClient] Stopped gracefully');
    console.log('[ApiClient] Final stats:', this.getStats());
  }
}
