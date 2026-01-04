import { AlertTriangle, ChevronLeft } from 'lucide-react';
import type { CardCommand, CommandParameter } from '../../shared/handlers/types';
import { Button } from './ui/button';

interface ParameterFormProps {
  command: CardCommand;
  parameters: Record<string, string | number | boolean>;
  onParameterChange: (param: CommandParameter, value: string) => void;
  onExecute: () => void;
  onBack: () => void;
  showConfirm?: boolean;
  onCancelConfirm?: () => void;
}

/**
 * Shared form component for command parameters.
 * Used by both CommandPanel and EmvWorkflowPanel.
 */
export function ParameterForm({
  command,
  parameters,
  onParameterChange,
  onExecute,
  onBack,
  showConfirm = false,
  onCancelConfirm,
}: ParameterFormProps) {
  return (
    <div className="p-3">
      {/* Back button and command name */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{command.name}</h3>
          {command.isDestructive && <AlertTriangle className="h-4 w-4 text-destructive" />}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{command.description}</p>
      </div>

      {/* Parameters */}
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

      {/* Confirmation / Execute */}
      {showConfirm ? (
        <div className="mt-4 p-3 border border-destructive/50 rounded bg-destructive/10">
          <p className="text-sm text-destructive mb-2">
            {command.isDestructive
              ? 'This action may cause data loss. Are you sure?'
              : 'Confirm execution?'}
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={onExecute}>
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelConfirm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full mt-4" onClick={onExecute}>
          Execute
        </Button>
      )}
    </div>
  );
}

/**
 * Parse a string value to the appropriate type based on parameter type.
 */
export function parseParameterValue(
  param: CommandParameter,
  value: string
): string | number | boolean {
  if (param.type === 'number') {
    return parseInt(value, 10) || 0;
  } else if (param.type === 'boolean') {
    return value === 'true';
  }
  return value;
}

/**
 * Initialize default parameter values for a command.
 */
export function initializeParameters(
  command: CardCommand
): Record<string, string | number | boolean> {
  const defaults: Record<string, string | number | boolean> = {};
  command.parameters?.forEach((p) => {
    if (p.defaultValue !== undefined) {
      defaults[p.id] = p.defaultValue;
    }
  });
  return defaults;
}
