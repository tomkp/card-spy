import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScriptFile, VirtualCardFile, WorkspaceListing } from '@shared/types';
import { parseVirtualCard, type VirtualCardDefinition } from '@shared/virtual/definition';
import { DEMO_CARDS } from '@shared/virtual/demo-cards';
import { EXAMPLE_SCRIPTS } from './examples';

/**
 * The user's scripts and virtual cards, as plain files in a folder they can open, edit and commit:
 *   <root>/scripts/*.ts
 *   <root>/cards/*.json
 */
export class Workspace {
  constructor(readonly root: string) {}

  private get scriptsDir() {
    return join(this.root, 'scripts');
  }

  private get cardsDir() {
    return join(this.root, 'cards');
  }

  /** Creates the folders, and seeds the example scripts the first time only. */
  async init(): Promise<void> {
    await mkdir(this.cardsDir, { recursive: true });
    const created = await mkdir(this.scriptsDir, { recursive: true });
    if (created) {
      for (const [name, content] of Object.entries(EXAMPLE_SCRIPTS)) {
        await writeFile(join(this.scriptsDir, name), content);
      }
    }
  }

  async list(): Promise<WorkspaceListing> {
    const scripts: ScriptFile[] = [];
    for (const name of await sortedFiles(this.scriptsDir, '.ts')) {
      scripts.push({ name, content: await readFile(join(this.scriptsDir, name), 'utf8') });
    }
    const cards: VirtualCardFile[] = DEMO_CARDS.map((definition, i) => ({
      id: `builtin:${i}`,
      builtin: true,
      definition,
    }));
    for (const name of await sortedFiles(this.cardsDir, '.json')) {
      try {
        const definition = parseVirtualCard(
          JSON.parse(await readFile(join(this.cardsDir, name), 'utf8')),
        );
        cards.push({ id: name, builtin: false, definition });
      } catch (e) {
        console.warn(`Skipping ${name}: ${(e as Error).message}`);
      }
    }
    return { root: this.root, scripts, cards };
  }

  async saveScript(name: string, content: string): Promise<void> {
    await writeFile(join(this.scriptsDir, safeName(name, '.ts')), content);
  }

  async deleteScript(name: string): Promise<void> {
    await rm(join(this.scriptsDir, safeName(name, '.ts')));
  }

  async renameScript(from: string, to: string): Promise<void> {
    await rename(
      join(this.scriptsDir, safeName(from, '.ts')),
      join(this.scriptsDir, safeName(to, '.ts')),
    );
  }

  /** Saves under a file name derived from the card's name; returns that file name. */
  async saveCard(definition: VirtualCardDefinition): Promise<string> {
    const valid = parseVirtualCard(definition);
    const base =
      valid.name
        .replace(/[^\w .-]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim() || 'card';
    const name = safeName(`${base}.json`, '.json');
    await writeFile(join(this.cardsDir, name), JSON.stringify(valid, null, 2) + '\n');
    return name;
  }

  async deleteCard(id: string): Promise<void> {
    await rm(join(this.cardsDir, safeName(id, '.json')));
  }
}

/** Accepts only a plain file name with the given extension, so the renderer cannot reach outside the workspace. */
function safeName(name: string, ext: string): string {
  if (!/^[\w][\w .()-]*$/.test(name) || !name.endsWith(ext) || name.includes('..')) {
    throw new Error(`Invalid file name "${name}"`);
  }
  return name;
}

async function sortedFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(ext) && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
