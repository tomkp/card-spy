import { closeTab, EXPLORER_TAB, set, useStore } from '../store';
import { ExplorerView } from './ExplorerView';
import { Icon } from './icons';
import { ScriptEditor } from './ScriptEditor';

export function EditorArea() {
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  const drafts = useStore((s) => s.drafts);

  return (
    <div className="panel">
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={tab === activeTab}
            className={`tab${tab === activeTab ? ' active' : ''}`}
            onClick={() => set({ activeTab: tab })}
            onAuxClick={(e) => e.button === 1 && closeTab(tab)}
          >
            {tab === EXPLORER_TAB ? 'Explorer' : <span className="mono">{tab}</span>}
            {tab !== EXPLORER_TAB &&
              (drafts[tab] !== undefined ? (
                <span className="modified" title="Unsaved changes" />
              ) : (
                <span
                  className="icon-btn close"
                  title="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab);
                  }}
                >
                  <Icon name="close" size={12} />
                </span>
              ))}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {activeTab === EXPLORER_TAB ? (
          <ExplorerView />
        ) : (
          <ScriptEditor key={activeTab} name={activeTab} />
        )}
      </div>
    </div>
  );
}
