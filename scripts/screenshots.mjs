// Takes the website's screenshots (site/screenshots) from the built app, using only the demo virtual
// cards: hardware readers are switched off and the workspace is a fresh temporary folder, so nothing
// from a real card can appear. Run `npm run build` first. Images are resized and encoded as WebP by
// the app's own Chromium, so no image tools are needed.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electronPath from 'electron';
import { _electron as electron } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'site/screenshots');
const MAX_WIDTH = 2000;

async function scenes(theme) {
  const workspace = mkdtempSync(join(tmpdir(), 'card-spy-shots-'));
  const app = await electron.launch({
    executablePath: electronPath,
    args: [root],
    cwd: root,
    env: { ...process.env, CARDSPY_WORKSPACE: workspace, CARDSPY_PCSC: 'off' },
  });
  const win = await app.firstWindow();
  await win.emulateMedia({ colorScheme: theme });
  await win.waitForSelector('.titlebar');
  await win.waitForTimeout(500);

  const shot = async (name) => {
    await win.mouse.move(5, 5); // no hover effects in the picture
    await win.waitForTimeout(400);
    const png = await win.screenshot();
    const webp = await win.evaluate(
      async ({ data, maxWidth }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.9).split(',')[1];
      },
      { data: png.toString('base64'), maxWidth: MAX_WIDTH },
    );
    const file = join(outDir, `${name}-${theme}.webp`);
    writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log('wrote', file.replace(root, ''));
  };

  // 1. Explorer: the demo Visa, with a record's TLV decoded in the inspector.
  await win.click('.panel.side .list-item:has-text("Demo Visa Debit")');
  await win.click('button:has-text("Explore card")');
  await win.waitForSelector('.tree-row:has-text("Transaction log")');
  await win.click('.tree-row:has-text("SFI 2 · record 1") .twisty');
  await win.click('.tree-row:has-text("SFI 2 · record 1")');
  await shot('explorer');

  // 2. Console: a SELECT, its GET RESPONSE selected and decoded.
  await win.fill('#console-input', 'select A0000000031010');
  await win.press('#console-input', 'Enter');
  await win.waitForSelector('.console-result');
  await shot('console');

  // 3. Script: read-emv.ts paused part-way through in step mode.
  await win.click('.panel.side .list-item:has-text("read-emv.ts")');
  await win.waitForSelector('.monaco-editor');
  await win.waitForTimeout(1500);
  await win.click('.titlebar button:has-text("Step")');
  for (let i = 0; i < 9; i++) {
    await win.waitForSelector('.pause-banner');
    await win.click('.pause-banner button:has-text("Step")');
    await win.waitForTimeout(150);
  }
  await win.waitForSelector('.pause-banner');
  await shot('script');
  await win.click('.pause-banner button:has-text("Stop")');

  // 4. NFC: the demo NTAG215 and its NDEF records.
  await win.click('.panel.side .list-item:has-text("Demo NTAG215")');
  await win.click('.tab:has-text("Explorer")');
  await win.click('button:has-text("Explore card")');
  await win.waitForSelector('.tree-row:has-text("NDEF message")');
  await win.click('.tree-row:has-text("NDEF message")');
  await win.click('.seg-btn:has-text("Trace")');
  await shot('nfc');

  await app.close();
  rmSync(workspace, { recursive: true, force: true });
}

for (const theme of ['dark', 'light']) await scenes(theme);
