import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = fileURLToPath(new URL('dist', root));
await rm(dist, { recursive: true, force: true });
await cp(fileURLToPath(new URL('web', root)), dist, { recursive: true });
console.log('Static web build ready in dist/');
