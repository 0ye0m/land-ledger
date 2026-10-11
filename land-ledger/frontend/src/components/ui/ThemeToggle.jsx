import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'landledger.theme';

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Circular reveal duration + easing - matches the "smart browser" reference
 * (View Transitions API hardware-accelerated clip-path morph). */
const MORPH_MS = 1200;
const MORPH_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(KEY) || 'light';
    } catch {
      return 'light';
    }
  });
  const themeRef = useRef(theme);

  useEffect(() => {
    applyTheme(theme);
    themeRef.current = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  function handleToggle(event) {
    const next = themeRef.current === 'dark' ? 'light' : 'dark';
    const flip = () => setTheme(next);

    // Graceful fallback: no View Transitions API, or the visitor asked for
    // reduced motion - flip instantly, exactly like before.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof document.startViewTransition !== 'function' || reduced) {
      flip();
      return;
    }

    // Origin of the reveal: the toggle button itself (keyboard activation
    // reports click at 0,0, so anchor on the button's box instead).
    let x = event.clientX;
    let y = event.clientY;
    if (!x && !y) {
      const box = event.currentTarget?.getBoundingClientRect?.();
      if (box) {
        x = box.left + box.width / 2;
        y = box.top + box.height / 2;
      }
    }

    const transition = document.startViewTransition(flip);

    transition.ready
      .then(() => {
        // Radius reaches the furthest viewport corner from the click point,
        // so the circle always covers the whole screen.
        const endRadius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y)
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: MORPH_MS,
            easing: MORPH_EASING,
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => {
        /* transition skipped (e.g. another one started) - theme already flipped */
      });
  }

  return (
    <button
      onClick={handleToggle}
      className="btn-ghost !p-2 rounded border border-transparent hover:border-border"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
