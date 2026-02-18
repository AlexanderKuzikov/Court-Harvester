import { promises as fs } from 'fs';
import path from 'path';
import { ApiClient } from './ApiClient';

interface ApiKey {
  apiKey: string;
  secretKey: string;
  filename: string;
}

export class KeyRotationManager {
  private keys: ApiKey[] = [];
  private currentIndex = 0;
  private usedRequests = 0;
  private totalRequests = 0;
  private currentClient: ApiClient | null = null;
  private limitPerKey = 9500; // Значение по умолчанию

  async init(
    keysDir: string,
    skipFiles: string[] = ['1.env'],
    limitPerKey: number = 9500
  ): Promise<void> {
    this.limitPerKey = limitPerKey;

    const files = (await fs.readdir(keysDir))
      .filter(f => f.endsWith('.env') && !skipFiles.includes(f))
      .sort();

    if (files.length === 0) {
      throw new Error(`❌ Нет доступных ключей в папке ${keysDir}`);
    }

    for (const file of files) {
      const content = await fs.readFile(path.join(keysDir, file), 'utf-8');
      const apiKey = this.parseEnvValue(content, 'DADATA_API_KEY');
      const secretKey = this.parseEnvValue(content, 'DADATA_SECRET_KEY');

      if (apiKey) {
        this.keys.push({ apiKey, secretKey: secretKey ?? '', filename: file });
      }
    }

    if (this.keys.length === 0) {
      throw new Error(`❌ Не найдено валидных ключей в папке ${keysDir}`);
    }

    const totalCapacity = this.keys.length * this.limitPerKey;
    console.log(`🔑 Загружено ключей: ${this.keys.length} (${this.keys.map(k => k.filename).join(', ')})`);
    console.log(`📊 Лимит на ключ: ${this.limitPerKey} запросов`);
    console.log(`📊 Суммарная ёмкость: ~${totalCapacity} запросов\n`);

    this.currentClient = this.createClient(this.currentIndex);
  }

  getClient(): ApiClient {
    if (!this.currentClient) {
      throw new Error('❌ KeyRotationManager не инициализирован. Вызови init() сначала.');
    }
    return this.currentClient;
  }

  async trackRequest(): Promise<boolean> {
    this.usedRequests++;
    this.totalRequests++;

    if (this.usedRequests >= this.limitPerKey) {
      return await this.rotateKey();
    }

    return true;
  }

  private async rotateKey(): Promise<boolean> {
    console.log(`\n🔄 Ключ ${this.keys[this.currentIndex].filename} исчерпан (${this.usedRequests} запросов)`);

    if (this.currentClient) {
      await this.currentClient.shutdown();
    }

    this.currentIndex++;
    this.usedRequests = 0;

    if (this.currentIndex >= this.keys.length) {
      console.log(`\n❌ Все ключи исчерпаны! Всего запросов: ${this.totalRequests}`);
      this.currentClient = null;
      return false;
    }

    this.currentClient = this.createClient(this.currentIndex);

    const remaining = this.keys.length - this.currentIndex;
    console.log(`✅ Переключились на ключ: ${this.keys[this.currentIndex].filename}`);
    console.log(`📊 Осталось ключей: ${remaining} (~${remaining * this.limitPerKey} запросов)\n`);

    return true;
  }

  async shutdown(): Promise<void> {
    if (this.currentClient) {
      await this.currentClient.shutdown();
      this.currentClient = null;
    }
  }

  getStats() {
    return {
      currentKey: this.keys[this.currentIndex]?.filename ?? 'нет',
      currentKeyRequests: this.usedRequests,
      limitPerKey: this.limitPerKey,
      totalRequests: this.totalRequests,
      keysUsed: this.currentIndex + 1,
      keysRemaining: Math.max(0, this.keys.length - this.currentIndex - 1),
      remainingCapacity: Math.max(0, this.keys.length - this.currentIndex - 1) * this.limitPerKey
        + (this.limitPerKey - this.usedRequests),
    };
  }

  private createClient(index: number): ApiClient {
    const key = this.keys[index];
    console.log(`🔑 Активный ключ: ${key.filename}`);
    return new ApiClient({
      apiKey: key.apiKey,
      secretKey: key.secretKey,
    });
  }

  private parseEnvValue(content: string, key: string): string | null {
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }
}
