import 'dotenv/config';
import { KeyRotationManager } from '../core/KeyRotationManager';
import path from 'path';

async function main() {
  const keyManager = new KeyRotationManager();
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env']);

  const client = keyManager.getClient();

  // Тестируем разные значения count на префиксе 77MS (много мировых судей Москвы)
  const counts = [20, 50, 100, 150, 200];

  for (const count of counts) {
    const resp = await client.suggestCourt('77MS', { count });
    const found = resp.suggestions.length;
    console.log(`count=${count} → получено: ${found} судов`);
  }

  await keyManager.shutdown();
}

main().catch(console.error);