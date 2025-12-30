import { useMemo } from 'react';
import type { Card, DetectedHandlerInfo } from '../../shared/types';
import { parseAtr, formatAtr, getAtrSummary } from '../../shared/atr';
import {
  CreditCard,
  KeyRound,
  Shield,
  Fingerprint,
  Smartphone,
  HelpCircle,
} from 'lucide-react';
import { CopyButton } from './CopyButton';

interface CardInfoHeaderProps {
  card: Card | null;
  handlers: DetectedHandlerInfo[];
  activeHandlerId: string | null;
}

/**
 * Get color class based on handler type.
 */
function getCardColor(handlerId: string | null): string {
  switch (handlerId) {
    case 'emv':
      return 'text-amber-600';
    case 'piv':
      return 'text-blue-600';
    case 'openpgp':
      return 'text-green-600';
    case 'fido':
      return 'text-purple-600';
    default:
      return 'text-muted-foreground';
  }
}

interface CardIconDisplayProps {
  handlerId: string | null;
}

function CardIconDisplay({ handlerId }: CardIconDisplayProps) {
  const colorClass = getCardColor(handlerId);

  // Render icon based on handlerId without dynamic component creation
  const renderIcon = () => {
    const className = "h-6 w-6";
    switch (handlerId) {
      case 'emv':
        return <CreditCard className={className} />;
      case 'piv':
        return <Fingerprint className={className} />;
      case 'openpgp':
        return <KeyRound className={className} />;
      case 'fido':
        return <Shield className={className} />;
      default:
        return <Smartphone className={className} />;
    }
  };

  return (
    <div className={`p-2 rounded-lg bg-muted ${colorClass}`}>
      {renderIcon()}
    </div>
  );
}

export function CardInfoHeader({ card, handlers, activeHandlerId }: CardInfoHeaderProps) {
  const activeHandler = handlers.find((h) => h.id === activeHandlerId);

  const atr = card?.atr;

  const parsedAtr = useMemo(() => {
    if (!atr) return null;
    return parseAtr(atr);
  }, [atr]);

  const atrSummary = useMemo(() => {
    if (!parsedAtr) return null;
    return getAtrSummary(parsedAtr);
  }, [parsedAtr]);

  const formattedAtr = useMemo(() => {
    if (!atr) return '';
    return formatAtr(atr);
  }, [atr]);

  if (!card) {
    return (
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <HelpCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium text-muted-foreground">No Card Inserted</div>
            <div className="text-xs text-muted-foreground">
              Insert a smart card to begin
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Determine what to show as the primary card name
  const primaryName = activeHandler?.cardType || activeHandler?.name || atrSummary || 'Smart Card';
  const secondaryInfo = activeHandler ? activeHandler.description : null;

  return (
    <div className="px-4 py-3 border-b border-border bg-card">
      <div className="flex items-start gap-3">
        {/* Card Icon */}
        <CardIconDisplay handlerId={activeHandlerId} />

        {/* Card Info */}
        <div className="flex-1 min-w-0">
          {/* Primary Name */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{primaryName}</span>
            {handlers.length > 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                +{handlers.length - 1} more
              </span>
            )}
          </div>

          {/* Secondary Info */}
          {secondaryInfo && (
            <div className="text-xs text-muted-foreground mt-0.5">{secondaryInfo}</div>
          )}

          {/* ATR and Protocol */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">ATR:</span>
              <code className="font-mono text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px]">
                {formattedAtr.length > 50 ? formattedAtr.substring(0, 47) + '...' : formattedAtr}
              </code>
              <CopyButton text={card.atr} label="ATR" />
            </div>
          </div>

          {/* Protocol and Additional Info */}
          <div className="flex items-center gap-3 mt-1.5">
            {parsedAtr && parsedAtr.protocols.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Protocol:</span>
                <span className="font-medium">{parsedAtr.protocols.join(', ')}</span>
              </div>
            )}

            {activeHandler && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Handler:</span>
                <span className="font-medium">{activeHandler.name}</span>
                {activeHandler.confidence && (
                  <span className="text-muted-foreground">({activeHandler.confidence}%)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="text-right text-xs">
          {activeHandler && activeHandler.commands && (
            <div className="text-muted-foreground">
              {activeHandler.commands.length} commands available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
