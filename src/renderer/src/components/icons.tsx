const paths = {
  play: <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" />,
  step: (
    <>
      <path d="M5 5l10 7-10 7z" fill="currentColor" stroke="none" />
      <path d="M19 5v14" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  eject: <path d="M12 5l7 8H5zM5 18h14" />,
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  record: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  reset: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
  explore: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  copy: <path d="M9 9h10v10H9zM5 15V5h10" />,
  check: <path d="M5 12l5 5 9-10" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
