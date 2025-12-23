import { CreditCard, ChevronRight } from 'lucide-react';
import { CopyButton } from './CopyButton';

export interface DiscoveredApp {
  aid: string;
  name?: string;
  label?: string;
  handlerId: string;
}

interface ApplicationsPanelProps {
  applications: DiscoveredApp[];
  selectedAid: string | null;
  onSelectApp: (aid: string) => void;
}

export function ApplicationsPanel({ applications, selectedAid, onSelectApp }: ApplicationsPanelProps) {
  if (applications.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        <p>No applications discovered yet.</p>
        <p className="text-xs mt-1">Click "Interrogate" to discover applications on the card.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Applications ({applications.length})
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {applications.map((app) => {
          const isSelected = selectedAid === app.aid;
          const displayName = app.name || app.label || 'Unknown Application';

          return (
            <button
              key={app.aid}
              onClick={() => onSelectApp(app.aid)}
              className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors border-b border-border last:border-b-0 ${
                isSelected ? 'bg-accent' : ''
              }`}
            >
              <CreditCard className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-foreground truncate">
                    {displayName}
                  </span>
                  {isSelected && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="text-xs text-muted-foreground font-mono truncate">
                    {app.aid.toUpperCase()}
                  </code>
                  <CopyButton text={app.aid.toUpperCase()} label="AID" />
                </div>
                {app.label && app.name && app.label !== app.name && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {app.label}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
