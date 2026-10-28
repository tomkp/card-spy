// Assembles the website into out/site: the pages in site/, plus the app icon from build/.
// The Pages workflow deploys that folder; open out/site/index.html to preview it locally.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'out/site');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
cpSync(join(root, 'build/icon.svg'), join(out, 'icon.svg'));
cpSync(join(root, 'build/icon.png'), join(out, 'icon.png'));
console.log(`site written to ${out.replace(root, '')}`);
