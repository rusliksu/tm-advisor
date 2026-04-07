import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const canonical = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'tm-extension',
  'tests',
  'e2e_synergy_tooltips.mjs',
);

await import(pathToFileURL(canonical).href);
