import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  CreditCard,
  ChevronRight,
  Check,
  Play,
  Search,
  Key,
  FileText,
  ChevronLeft,
} from 'lucide-react';
import type { CardCommand, CommandParameter } from '../../shared/handlers/types';
import type { DetectedHandlerInfo } from '../../shared/types';
import type { DiscoveredApp } from './ApplicationsPanel';
import { CopyButton } from './CopyButton';
import { Button } from './ui/button';

/**
 * EMV transaction workflow steps.
 */
type EmvStep = 'discovery' | 'apps' | 'selected';

/**
 * EMV workflow progress tracking (non-step state).
 */
interface EmvWorkflowProgress {
  pseSelected: boolean;
  ppseSelected: boolean;
  gpoExecuted: boolean;
  recordsRead: boolean;
}

interface EmvWorkflowPanelProps {
  handler: DetectedHandlerInfo;
  applications: DiscoveredApp[];
  selectedApplication: string | null;
  onSelectApplication: (aid: string) => void;
  onExecuteCommand: (commandId: string, parameters: Record<string, unknown>) => void;
}

/**
 * Categorized actions for the selected application.
 */
interface ActionCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  commands: CardCommand[];
}

/**
 * EMV Workflow Panel - provides a guided workflow for EMV card exploration.
 *
 * Flow:
 * 1. Discovery - Select PSE/PPSE to find applications
 * 2. Applications - View and select discovered apps
 * 3. Selected - App is selected, show available actions
 * 4. Action - Execute specific commands (GPO, Read Records, etc.)
 */
export function EmvWorkflowPanel({
  handler,
  applications,
  selectedApplication,
  onSelectApplication,
  onExecuteCommand,
}: EmvWorkflowPanelProps) {
  // Derive step from props - no effects needed
  const step: EmvStep = useMemo(() => {
    if (selectedApplication) return 'selected';
    if (applications.length > 0) return 'apps';
    return 'discovery';
  }, [selectedApplication, applications.length]);

  // Track workflow progress (PSE selected, GPO executed, etc.)
  const [progress, setProgress] = useState<EmvWorkflowProgress>({
    pseSelected: false,
    ppseSelected: false,
    gpoExecuted: false,
    recordsRead: false,
  });

  const [selectedAction, setSelectedAction] = useState<CardCommand | null>(null);
  const [parameters, setParameters] = useState<Record<string, string | number | boolean>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDiscoveryCommand = useCallback(
    (commandId: string) => {
      onExecuteCommand(commandId, {});
      if (commandId === 'select-pse') {
        setProgress((prev) => ({ ...prev, pseSelected: true }));
      } else if (commandId === 'select-ppse') {
        setProgress((prev) => ({ ...prev, ppseSelected: true }));
      }
    },
    [onExecuteCommand]
  );

  const handleSelectApp = useCallback(
    (aid: string) => {
      onSelectApplication(aid);
    },
    [onSelectApplication]
  );

  const handleExecuteAction = useCallback(() => {
    if (!selectedAction) return;
    onExecuteCommand(selectedAction.id, parameters);

    // Track workflow progress
    if (selectedAction.id === 'get-processing-options') {
      setProgress((prev) => ({ ...prev, gpoExecuted: true }));
    } else if (selectedAction.id === 'read-record') {
      setProgress((prev) => ({ ...prev, recordsRead: true }));
    }

    setSelectedAction(null);
    setParameters({});
  }, [selectedAction, parameters, onExecuteCommand]);

  const handleBackToActions = useCallback(() => {
    setSelectedAction(null);
    setParameters({});
  }, []);

  const handleSelectAction = useCallback((command: CardCommand) => {
    if (command.parameters && command.parameters.length > 0) {
      // Initialize defaults
      const defaults: Record<string, string | number | boolean> = {};
      command.parameters.forEach((p) => {
        if (p.defaultValue !== undefined) {
          defaults[p.id] = p.defaultValue;
        }
      });
      setParameters(defaults);
      setSelectedAction(command);
    } else {
      // Execute immediately
      onExecuteCommand(command.id, {});
    }
  }, [onExecuteCommand]);

  const handleParameterChange = (param: CommandParameter, value: string) => {
    let parsedValue: string | number | boolean = value;
    if (param.type === 'number') {
      parsedValue = parseInt(value, 10) || 0;
    } else if (param.type === 'boolean') {
      parsedValue = value === 'true';
    }
    setParameters((prev) => ({ ...prev, [param.id]: parsedValue }));
  };

  // Categorize commands for the actions view
  const actionCategories: ActionCategory[] = [
    {
      id: 'transaction',
      label: 'Transaction',
      icon: <Play className="h-4 w-4" />,
      commands: handler.commands.filter((c) => c.category === 'Transaction'),
    },
    {
      id: 'read',
      label: 'Read Data',
      icon: <FileText className="h-4 w-4" />,
      commands: handler.commands.filter((c) => c.category === 'Read'),
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Key className="h-4 w-4" />,
      commands: handler.commands.filter((c) => c.category === 'Security'),
    },
  ].filter((cat) => cat.commands.length > 0);

  // Flatten for keyboard navigation
  const allActions = actionCategories.flatMap((cat) => cat.commands);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'SELECT' ||
        activeElement?.tagName === 'TEXTAREA';

      if (isInputFocused) return;

      if (selectedAction) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleBackToActions();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleExecuteAction();
        }
      } else if (step === 'selected') {
        switch (e.key) {
          case 'ArrowUp':
          case 'k':
            e.preventDefault();
            setSelectedIndex((i) => Math.max(0, i - 1));
            break;
          case 'ArrowDown':
          case 'j':
            e.preventDefault();
            setSelectedIndex((i) => Math.min(allActions.length - 1, i + 1));
            break;
          case 'Enter':
            e.preventDefault();
            if (allActions[selectedIndex]) {
              handleSelectAction(allActions[selectedIndex]);
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    step,
    selectedAction,
    selectedIndex,
    allActions,
    handleBackToActions,
    handleExecuteAction,
    handleSelectAction,
  ]);

  // Scroll selected item into view
  useEffect(() => {
    if (step === 'selected' && !selectedAction && containerRef.current) {
      const selectedElement = containerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, step, selectedAction]);

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Progress */}
      <WorkflowProgress step={step} progress={progress} applications={applications} />

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {step === 'discovery' && (
          <DiscoveryView
            handler={handler}
            progress={progress}
            onExecute={handleDiscoveryCommand}
          />
        )}

        {step === 'apps' && (
          <ApplicationsView
            applications={applications}
            selectedAid={selectedApplication}
            onSelectApp={handleSelectApp}
          />
        )}

        {step === 'selected' && !selectedAction && (
          <ActionsView
            categories={actionCategories}
            selectedIndex={selectedIndex}
            onSelectAction={handleSelectAction}
            onHover={setSelectedIndex}
          />
        )}

        {selectedAction && (
          <ActionParametersView
            command={selectedAction}
            parameters={parameters}
            onParameterChange={handleParameterChange}
            onExecute={handleExecuteAction}
            onBack={handleBackToActions}
          />
        )}
      </div>

      {/* Footer */}
      <WorkflowFooter step={step} hasSelectedAction={!!selectedAction} />
    </div>
  );
}

/**
 * Visual progress indicator for the EMV workflow.
 */
function WorkflowProgress({
  step,
  progress,
  applications,
}: {
  step: EmvStep;
  progress: EmvWorkflowProgress;
  applications: DiscoveredApp[];
}) {
  const steps = [
    { id: 'discovery', label: 'Discover', done: applications.length > 0 },
    { id: 'apps', label: 'Select App', done: step === 'selected' },
    { id: 'selected', label: 'Explore', done: progress.gpoExecuted || progress.recordsRead },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="px-3 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const isActive = index === currentStepIndex;
          const isDone = step.done || index < currentStepIndex;

          return (
            <div key={step.id} className="flex items-center">
              {index > 0 && (
                <div
                  className={`w-4 h-px mx-1 ${
                    isDone ? 'bg-primary' : 'bg-border'
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                      ? 'text-primary'
                      : 'text-muted-foreground'
                }`}
              >
                {isDone && !isActive ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="w-3 text-center">{index + 1}</span>
                )}
                <span>{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Discovery step - Select PSE or PPSE to find applications.
 */
function DiscoveryView({
  handler,
  progress,
  onExecute,
}: {
  handler: DetectedHandlerInfo;
  progress: EmvWorkflowProgress;
  onExecute: (commandId: string) => void;
}) {
  const discoveryCommands = handler.commands.filter((c) => c.category === 'Discovery');
  const pseCommand = discoveryCommands.find((c) => c.id === 'select-pse');
  const ppseCommand = discoveryCommands.find((c) => c.id === 'select-ppse');

  return (
    <div className="p-3">
      <div className="mb-4">
        <h3 className="font-medium text-sm">Discover Applications</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Select PSE (contact) or PPSE (contactless) to find payment applications on the card.
        </p>
      </div>

      <div className="space-y-2">
        {pseCommand && (
          <button
            onClick={() => onExecute('select-pse')}
            className={`w-full flex items-center gap-3 p-3 rounded border transition-colors ${
              progress.pseSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-accent/50'
            }`}
          >
            <Search className="h-5 w-5 text-primary" />
            <div className="flex-1 text-left">
              <div className="font-medium text-sm">Select PSE</div>
              <div className="text-xs text-muted-foreground">
                Payment System Environment (contact cards)
              </div>
            </div>
            {progress.pseSelected && <Check className="h-4 w-4 text-primary" />}
          </button>
        )}

        {ppseCommand && (
          <button
            onClick={() => onExecute('select-ppse')}
            className={`w-full flex items-center gap-3 p-3 rounded border transition-colors ${
              progress.ppseSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-accent/50'
            }`}
          >
            <Search className="h-5 w-5 text-primary" />
            <div className="flex-1 text-left">
              <div className="font-medium text-sm">Select PPSE</div>
              <div className="text-xs text-muted-foreground">
                Proximity PSE (contactless cards)
              </div>
            </div>
            {progress.ppseSelected && <Check className="h-4 w-4 text-primary" />}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        After selecting PSE/PPSE, discovered applications will appear automatically.
      </p>
    </div>
  );
}

/**
 * Applications step - View and select discovered apps.
 */
function ApplicationsView({
  applications,
  selectedAid,
  onSelectApp,
}: {
  applications: DiscoveredApp[];
  selectedAid: string | null;
  onSelectApp: (aid: string) => void;
}) {
  if (applications.length === 0) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        <p>No applications discovered yet.</p>
        <p className="text-xs mt-1">Select PSE or PPSE to discover applications.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Found {applications.length} application{applications.length !== 1 ? 's' : ''}
        </span>
      </div>
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
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Actions step - Categorized commands for the selected app.
 */
function ActionsView({
  categories,
  selectedIndex,
  onSelectAction,
  onHover,
}: {
  categories: ActionCategory[];
  selectedIndex: number;
  onSelectAction: (command: CardCommand) => void;
  onHover: (index: number) => void;
}) {
  let actionIndex = 0;

  return (
    <div>
      {categories.map((category) => (
        <div key={category.id}>
          <div className="px-3 py-2 bg-muted/50 border-y border-border flex items-center gap-2">
            <span className="text-muted-foreground">{category.icon}</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {category.label}
            </span>
          </div>
          {category.commands.map((command) => {
            const currentIndex = actionIndex++;
            const isSelected = currentIndex === selectedIndex;

            return (
              <button
                key={command.id}
                data-index={currentIndex}
                onClick={() => onSelectAction(command)}
                onMouseEnter={() => onHover(currentIndex)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-b border-border last:border-b-0 ${
                  isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{command.name}</div>
                  <div className="text-xs text-muted-foreground">{command.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Action parameters view - Configure and execute a command.
 */
function ActionParametersView({
  command,
  parameters,
  onParameterChange,
  onExecute,
  onBack,
}: {
  command: CardCommand;
  parameters: Record<string, string | number | boolean>;
  onParameterChange: (param: CommandParameter, value: string) => void;
  onExecute: () => void;
  onBack: () => void;
}) {
  return (
    <div className="p-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-4">
        <h3 className="font-medium">{command.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{command.description}</p>
      </div>

      {command.parameters?.map((param) => (
        <div key={param.id} className="mb-3">
          <label className="text-sm text-muted-foreground block mb-1">
            {param.name}
            {param.required && <span className="text-destructive ml-1">*</span>}
          </label>

          {param.type === 'select' ? (
            <select
              className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded font-mono"
              value={(parameters[param.id] as string) ?? param.defaultValue ?? ''}
              onChange={(e) => onParameterChange(param, e.target.value)}
            >
              <option value="">Select...</option>
              {param.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : param.type === 'boolean' ? (
            <select
              className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded"
              value={String(parameters[param.id] ?? param.defaultValue ?? false)}
              onChange={(e) => onParameterChange(param, e.target.value)}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          ) : (
            <input
              type={param.type === 'number' ? 'number' : 'text'}
              className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded font-mono"
              placeholder={param.description}
              value={(parameters[param.id] as string) ?? param.defaultValue ?? ''}
              onChange={(e) => onParameterChange(param, e.target.value)}
            />
          )}
        </div>
      ))}

      <Button className="w-full mt-4" onClick={onExecute}>
        Execute
      </Button>
    </div>
  );
}

/**
 * Footer with contextual keyboard hints.
 */
function WorkflowFooter({
  step,
  hasSelectedAction,
}: {
  step: EmvStep;
  hasSelectedAction: boolean;
}) {
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="px-3 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
      {step === 'discovery' && <span>Click to discover applications</span>}
      {step === 'apps' && (
        <div className="flex gap-3">
          <span>Click to select an application</span>
        </div>
      )}
      {step === 'selected' && !hasSelectedAction && (
        <div className="flex gap-3">
          <span>
            <kbd>↑↓</kbd> Navigate
          </span>
          <span>
            <kbd>Enter</kbd> Select
          </span>
        </div>
      )}
      {hasSelectedAction && (
        <div className="flex gap-3">
          <span>
            <kbd>Esc</kbd> Back
          </span>
          <span>
            <kbd>{cmdKey}+Enter</kbd> Execute
          </span>
        </div>
      )}
    </div>
  );
}
