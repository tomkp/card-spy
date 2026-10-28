// Builds every icon file from build/icon.svg. macOS only: needs rsvg-convert (brew install librsvg)
// and iconutil (part of macOS). The outputs are committed, so this only runs when the icon changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const svg = join(root, 'build/icon.svg');
const tmp = mkdtempSync(join(tmpdir(), 'card-spy-icons-'));

const render = (size, out) => execFileSync('rsvg-convert', ['-w', `${size}`, '-h', `${size}`, svg, '-o', out]);

// macOS: an iconset folder of named sizes, packed by iconutil.
const iconset = join(tmp, 'icon.iconset');
mkdirSync(iconset);
for (const size of [16, 32, 128, 256, 512]) {
  render(size, join(iconset, `icon_${size}x${size}.png`));
  render(size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(root, 'build/icon.icns')]);

// Windows: an .ico holding PNG images (supported since Vista).
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const images = icoSizes.map((size) => {
  const file = join(tmp, `ico-${size}.png`);
  render(size, file);
  return readFileSync(file);
});
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const entry = 6 + 16 * i;
  const size = icoSizes[i];
  header.writeUInt8(size >= 256 ? 0 : size, entry); // 0 means 256
  header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2); // palette colours
  header.writeUInt8(0, entry + 3); // reserved
  header.writeUInt16LE(1, entry + 4); // colour planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync(join(root, 'build/icon.ico'), Buffer.concat([header, ...images]));

// Linux packages and the window icon at runtime.
render(1024, join(root, 'build/icon.png'));
render(512, join(root, 'resources/icon.png'));

rmSync(tmp, { recursive: true, force: true });
console.log('icons written: build/icon.icns, build/icon.ico, build/icon.png, resources/icon.png');
