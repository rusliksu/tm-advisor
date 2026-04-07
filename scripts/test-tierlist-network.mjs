import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const canonical = path.resolve(__dirname, '..', 'tools', 'site', 'test-tierlist-network.mjs');
const canonicalUrl = pathToFileURL(canonical).href;
const mod = await import(canonicalUrl);
await mod.run();
