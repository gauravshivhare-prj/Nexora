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
