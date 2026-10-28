import { revealWorkspace } from '../actions';
import { selectedReader, useStore } from '../store';

export function StatusBar() {
  const root = useStore((s) => s.workspace?.root);
  const reader = useStore((s) => selectedReader(s));
  const exchanges = useStore((s) => s.trace.length);
  const run = useStore((s) => s.run);
  const explorer = useStore((s) => s.explorer.status);

  const activity = run
    ? run.paused
      ? `Paused in ${run.script}${run.paused.line ? ` at line ${run.paused.line}` : ''}`
      : `Running ${run.script}`
    : explorer === 'running'
      ? 'Exploring card…'
      : 'Ready';

  return (
    <footer className="statusbar">
      <span>{activity}</span>
      <span className="grow">
        {reader
          ? `${reader.name}${reader.card ? ` · ATR ${reader.card.atr}` : ' · no card'}`
          : 'No reader'}
      </span>
      <span>{exchanges} trace entries</span>
      {root && (
        <span
          className="no-drag"
          style={{ cursor: 'pointer' }}
          onClick={revealWorkspace}
          title="Open the workspace folder"
        >
          {root}
        </span>
      )}
    </footer>
  );
}
