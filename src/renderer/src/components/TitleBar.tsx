import { explore, resumeScript, runScript, stopExploring, stopScript } from '../actions';
import { EXPLORER_TAB, useStore } from '../store';
import appIcon from '../../../../build/icon.svg';
import { Icon } from './icons';

const mac = navigator.userAgent.includes('Mac');
export const MOD = mac ? '⌘' : 'Ctrl+';

export function TitleBar() {
  const activeTab = useStore((s) => s.activeTab);
  const run = useStore((s) => s.run);
  const exploring = useStore((s) => s.explorer.status === 'running');
  const hasCard = useStore((s) => Boolean(s.readers.find((r) => r.id === s.readerId)?.card));
  const script = activeTab === EXPLORER_TAB ? undefined : activeTab;

  return (
    <header className={`titlebar${mac ? ' mac' : ''}`}>
      <span className="brand">
        <img src={appIcon} alt="" width={20} height={20} />
        Card Spy
      </span>
      <span className="spacer" />
      {exploring ? (
        <button className="btn" onClick={stopExploring}>
          <Icon name="stop" size={12} /> Stop exploring
        </button>
      ) : (
        <button
          className="btn"
          onClick={() => void explore()}
          disabled={!hasCard || Boolean(run)}
          title="Read everything Card Spy understands from the card"
        >
          <Icon name="explore" /> Explore <kbd>{MOD}E</kbd>
        </button>
      )}
      {run ? (
        <>
          {run.paused && (
            <>
              <button
                className="btn"
                onClick={() => resumeScript(true)}
                title="Send this APDU and pause before the next (F10)"
              >
                <Icon name="step" size={12} /> Step <kbd>F10</kbd>
              </button>
              <button
                className="btn"
                onClick={() => resumeScript(false)}
                title="Run to the end (F5)"
              >
                <Icon name="play" size={12} /> Continue <kbd>F5</kbd>
              </button>
            </>
          )}
          <button className="btn" onClick={stopScript} title="Stop (Shift+F5)">
            <Icon name="stop" size={12} /> Stop
          </button>
        </>
      ) : (
        <>
          <button
            className="btn"
            onClick={() => script && runScript(script, true)}
            disabled={!script}
            title="Run, pausing before every APDU (F10)"
          >
            <Icon name="step" size={12} /> Step
          </button>
          <button
            className="btn primary"
            onClick={() => script && runScript(script)}
            disabled={!script}
            title={script ? `Run ${script}` : 'Open a script to run it'}
          >
            <Icon name="play" size={12} /> Run <kbd>{MOD}↩</kbd>
          </button>
        </>
      )}
    </header>
  );
}
