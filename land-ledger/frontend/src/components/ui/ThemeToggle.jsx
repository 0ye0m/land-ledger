import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'landledger.theme';

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(KEY) || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      className="btn-ghost !p-2 rounded border border-transparent hover:border-border"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
