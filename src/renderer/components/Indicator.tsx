interface IndicatorProps {
  status: 'activated' | 'deactivated' | 'inserted' | 'removed' | 'unknown';
  title?: string;
  size?: 'sm' | 'md';
}

const statusColors = {
  activated: 'bg-success',
  inserted: 'bg-success',
  deactivated: 'bg-error',
  removed: 'bg-error',
  unknown: 'bg-muted-foreground',
};

export function Indicator({ status, title, size = 'md' }: IndicatorProps) {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${statusColors[status]}`}
      title={title}
    />
  );
}
