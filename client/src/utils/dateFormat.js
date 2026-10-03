/**
 * Date/time formatting helpers used across multiple pages.
 *
 * Originally defined inside ResumePage.jsx (formatDate) and
 * CareerTwinPage.jsx (formatDateTime); moved here because other pages were
 * importing them across page boundaries.
 */

/** Short date: "22 Sep 2026". */
export function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Date plus time: "22 Sep 2026, 12:07 pm". */
export function formatDateTime(value) {
  if (!value) return 'an unknown time';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'an unknown time';

  return date.toLocaleString('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Relative time: "just now", "5m ago", "2h ago", "3d ago", or "22 Sep 2026". */
export function formatRelativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(value);
}
