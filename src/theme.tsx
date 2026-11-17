import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Mode = 'night' | 'day';

// Night: near-black surfaces with a green accent (the original look).
const night = {
  accent: '#22C55E',
  bg: '#080D0B',
  surface: '#101814',
  surface2: '#16211B',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#3B82F6',
  border: '#1E2B24',
  overlay: 'rgba(16,24,20,0.95)',
  onAccent: '#052E16',
  placeholder: '#6B7280',
  mapBg: '#0F1512',
  errText: '#FCA5A5',
  neutralDot: '#6B7280',
  glow: 'rgba(34,197,94,0.10)',
  accentBorder: 'rgba(34,197,94,0.55)',
  isDark: true,
};

// Day: white and sky blue, taken from the TRUKOVA logo.
const day: typeof night = {
  accent: '#0A84F5',
  bg: '#F3F8FD',
  surface: '#FFFFFF',
  surface2: '#E7F1FC',
  text: '#0B2540',
  muted: '#5A7088',
  red: '#DC2626',
  amber: '#D97706',
  blue: '#0A84F5',
  border: '#D3E4F5',
  overlay: 'rgba(255,255,255,0.96)',
  onAccent: '#FFFFFF',
  placeholder: '#8AA0B6',
  mapBg: '#E7F1FC',
  errText: '#B91C1C',
  neutralDot: '#9AB0C6',
  glow: 'rgba(10,132,245,0.12)',
  accentBorder: 'rgba(10,132,245,0.45)',
  isDark: false,
};

export type Colors = typeof night;

const KEY = 'trukova.theme';

type Ctx = { mode: Mode; colors: Colors; toggle: () => void };
const ThemeContext = createContext<Ctx>({ mode: 'night', colors: night, toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children, onReady }: { children: React.ReactNode; onReady?: () => void }) {
  const [mode, setMode] = useState<Mode>('night');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'day' || v === 'night') setMode(v);
      })
      .catch(() => {})
      .finally(() => onReady?.());
  }, [onReady]);

  const toggle = useCallback(() => {
    setMode((m) => {
      const next: Mode = m === 'night' ? 'day' : 'night';
      AsyncStorage.setItem(KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, colors: mode === 'day' ? day : night, toggle }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
