import { useId } from 'react';

import { useTheme } from '../hooks/useTheme.js';
import { THEMES } from '../theme/themeStorage.js';

/**
 * Light / Dark / System.
 *
 * A radio group rather than three buttons or a cycling icon. The three
 * options are mutually exclusive states, one of which is always selected,
 * which is precisely what radios mean — so arrow keys move between them, the
 * selected one is announced as selected, and none of that had to be
 * reimplemented with `aria-pressed` and a keydown handler.
 *
 * The inputs are visually hidden but not `display: none`: they stay
 * focusable, and the label beside each is what gets styled. Focus is drawn
 * on the label through `peer-focus-visible`, so the ring appears where the
 * control visually is.
 *
 * Icon-only by default, with the label appearing from `sm` up in the wide
 * variant. Every option carries a text label for assistive technology either
 * way, and the group itself is named.
 */
const OPTIONS = [
  { value: THEMES.LIGHT, label: 'Light' },
  { value: THEMES.DARK, label: 'Dark' },
  { value: THEMES.SYSTEM, label: 'System' },
];

/**
 * @param {object} props
 * @param {boolean} [props.showLabels] Show the option names beside the icons.
 * @param {string} [props.className] Must include a display utility. The group
 *   deliberately sets none of its own: a base `inline-flex` here and a
 *   `hidden sm:inline-flex` from the caller are two utilities in the same
 *   Tailwind group, and which one wins is decided by their order in the
 *   generated stylesheet rather than by the class attribute — which had this
 *   control visible at 320px, pushing the navbar 28px wide.
 */
export function ThemeToggle({ showLabels = false, className = 'inline-flex' }) {
  const { theme, setTheme } = useTheme();

  // Radios need a name shared within the group and unique between groups —
  // the switcher appears in the navbar and in the mobile panel at once, and
  // a shared name would make the two groups fight over one selection.
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`items-center gap-0.5 rounded-xl border border-orange-200 bg-surface/80 p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const isSelected = theme === option.value;

        // Explicitly associated rather than relying on the wrapping label.
        // Both are valid HTML, but every other control in this product is
        // wired label-for-id — and the accessibility tests check for that
        // association by name on every input on the page.
        const inputId = `${name}-${option.value}`;

        return (
          <label
            key={option.value}
            htmlFor={inputId}
            title={`${option.label} theme`}
            className={`relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
              isSelected
                ? 'bg-orange-100 text-brand-text'
                : 'text-ink-muted hover:bg-orange-50 hover:text-ink'
            }`}
          >
            <input
              id={inputId}
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
              onChange={() => setTheme(option.value)}
              className="absolute size-0 opacity-0"
            />

            <ThemeGlyph theme={option.value} />

            {/* Always in the accessible name; visible only where there is
                room for it, which is the mobile panel and the auth screens. */}
            <span className={showLabels ? '' : 'sr-only'}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * One glyph per option: sun, moon, and a display for "whatever the machine
 * says". Inline SVG at 1em so it scales with the control, `currentColor` so
 * it inherits the selected state's colour, and no icon dependency.
 */
function ThemeGlyph({ theme }) {
  const common = {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'size-3.5 shrink-0',
  };

  if (theme === THEMES.LIGHT) {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }

  if (theme === THEMES.DARK) {
    return (
      <svg {...common}>
        <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}
