import '../env';
import { KeyRotationManager } from '../core/KeyRotationManager';
import path from 'path';

async function main() {
  const keyManager = new KeyRotationManager();
  await keyManager.init(path.join(process.cwd(), 'keys'), ['1.env']);
  const client = keyManager.getClient();

  console.log('\n🔍 Полный объект СИП из DaData...\n');

  const resp = await client.suggestCourt('интеллект', { count: 5 });

  if (resp.suggestions.length > 0) {
    console.log(JSON.stringify(resp.suggestions[0], null, 2));
  } else {
    console.log('❌ Ничего не найдено');
  }

  await keyManager.shutdown();
}

main().catch(console.error);