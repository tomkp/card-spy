import { useEffect, useRef } from 'react';
import { describeCommand } from '@shared/apdu';
import { fromHex } from '@shared/hex';
import { resumeScript, runScript, saveScript, stopScript } from '../actions';
import { modelFor, monaco, themeName } from '../scripting/monaco';
import { scriptContent, set, useStore } from '../store';
import { Icon } from './icons';

export function ScriptEditor({ name }: { name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const run = useStore((s) => s.run);
  const errorLine = useStore((s) => s.errorLines[name] || undefined);
  const paused = run?.script === name ? run.paused : undefined;

  useEffect(() => {
    const model = modelFor(name, scriptContent(name));
    const editor = monaco.editor.create(host.current!, {
      model,
      theme: themeName(),
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      fixedOverflowWidgets: true,
      padding: { top: 8 },
    });
    editorRef.current = editor;

    const changes = model.onDidChangeContent(() => {
      const value = model.getValue();
      set((s) => {
        const saved = s.workspace?.scripts.find((x) => x.name === name)?.content;
        const { [name]: _previous, ...drafts } = s.drafts;
        return {
          drafts: value === saved ? drafts : { ...drafts, [name]: value },
          errorLines: { ...s.errorLines, [name]: 0 },
        };
      });
    });

    const { KeyMod, KeyCode } = monaco;
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => runScript(name));
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => void saveScript(name));

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onTheme = () => monaco.editor.setTheme(themeName());
    media.addEventListener('change', onTheme);
    editor.focus();

    return () => {
      changes.dispose();
      media.removeEventListener('change', onTheme);
      editorRef.current = null;
      editor.dispose(); // the model stays, so undo history survives switching tabs
    };
  }, [name]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const marks: monaco.editor.IModelDeltaDecoration[] = [];
    const line = (n: number, className: string) =>
      marks.push({
        range: new monaco.Range(n, 1, n, 1),
        options: { isWholeLine: true, className },
      });
    if (paused?.line) line(paused.line, 'monaco-paused-line');
    if (errorLine) line(errorLine, 'monaco-error-line');
    const collection = editor.createDecorationsCollection(marks);
    const reveal = paused?.line ?? errorLine;
    if (reveal) editor.revealLineInCenterIfOutsideViewport(reveal);
    return () => collection.clear();
  }, [paused?.line, errorLine]);

  return (
    <>
      {paused && (
        <div className="pause-banner">
          <Icon name="step" size={12} />
          <span className="grow">
            Paused before <strong>{describeCommand(fromHex(paused.command)).name}</strong>{' '}
            <span className="mono dim">{paused.command}</span>
            {paused.line ? <span className="dim"> · line {paused.line}</span> : null}
          </span>
          <button className="btn small" onClick={() => resumeScript(true)}>
            Step <kbd>F10</kbd>
          </button>
          <button className="btn small" onClick={() => resumeScript(false)}>
            Continue <kbd>F5</kbd>
          </button>
          <button className="btn small" onClick={stopScript}>
            Stop
          </button>
        </div>
      )}
      <div ref={host} className="editor-host" style={{ flex: 1, minHeight: 0 }} />
    </>
  );
}
