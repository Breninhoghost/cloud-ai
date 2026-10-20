const PATHS = {
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  send: 'M12 19V5M5 12l7-7 7 7',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  check: 'M5 13l4 4L19 7',
  thumb: 'M7 11v9H4v-9h3zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5.2a1.8 1.8 0 0 1 1.8 2.1l-1.2 7A2 2 0 0 1 17.3 20H7',
  refresh: 'M20 11A8 8 0 0 0 5.5 7.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15M20 20v-5h-5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  clip: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  x: 'M6 6l12 12M18 6L6 18',
  logout: 'M10 5H5v14h5M15 8l4 4-4 4M19 12H9',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  chevron: 'M6 9l6 6 6-6',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
};

export default function Icon({ name, size = 18, className = '', fill = false, ...rest }) {
  if (name === 'stop') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...rest}>
        <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
