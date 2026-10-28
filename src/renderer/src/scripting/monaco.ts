// Only the editor and TypeScript: the full 'monaco-editor' entry bundles every language.
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/typescript/register';
import * as typescript from 'monaco-editor/languages/features/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';
import scriptGlobals from './script-globals.d.ts?raw';

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker(),
};

const ts = typescript.typescriptDefaults;
ts.setCompilerOptions({
  target: typescript.ScriptTarget.ES2020,
  module: typescript.ModuleKind.ESNext,
  // Every script is a module, so top-level await works and scripts don't share top-level names.
  moduleDetection: 3,
  lib: ['es2023'],
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
});
ts.addExtraLib(scriptGlobals, 'file:///card-spy/globals.d.ts');

monaco.editor.defineTheme('card-spy-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#16181d',
    'editor.lineHighlightBackground': '#1f2229',
    'editorGutter.background': '#16181d',
  },
});
monaco.editor.defineTheme('card-spy-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#ffffff' },
});

export function themeName(): string {
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'card-spy-light'
    : 'card-spy-dark';
}

export function modelFor(name: string, content: string): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(`file:///scripts/${encodeURIComponent(name)}`);
  return monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, 'typescript', uri);
}

/** Drops the model when a script is renamed or deleted, so its old name stops type-checking. */
export function disposeModel(name: string): void {
  monaco.editor
    .getModel(monaco.Uri.parse(`file:///scripts/${encodeURIComponent(name)}`))
    ?.dispose();
}

export { monaco };
