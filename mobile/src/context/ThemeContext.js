import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'app_theme_preference';

export const lightColors = {
  background: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  text: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  border: '#e5e7eb',
  separator: '#e5e7eb',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  primaryText: '#ffffff',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
  dangerText: '#dc2626',
  success: '#16a34a',
  successLight: '#f0fdf4',
  warning: '#f59e0b',
  warningLight: '#fffbeb',
  inputBg: '#ffffff',
  placeholder: '#9ca3af',
  headerBg: '#ffffff',
  tabBarBg: '#ffffff',
  card: '#ffffff',
  overlay: 'rgba(0,0,0,0.5)',
  shadow: '#000000',
};

export const darkColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#334155',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  border: '#334155',
  separator: '#334155',
  primary: '#3b82f6',
  primaryLight: '#1e3a5f',
  primaryText: '#ffffff',
  danger: '#f87171',
  dangerLight: '#3b1a1a',
  dangerText: '#f87171',
  success: '#4ade80',
  successLight: '#14532d',
  warning: '#fbbf24',
  warningLight: '#451a03',
  inputBg: '#1e293b',
  placeholder: '#64748b',
  headerBg: '#1e293b',
  tabBarBg: '#1e293b',
  card: '#1e293b',
  overlay: 'rgba(0,0,0,0.7)',
  shadow: '#000000',
};

const ThemeContext = createContext({
  isDark: false,
  colors: lightColors,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState(null); // null = follow system

  useEffect(() => {
    SecureStore.getItemAsync(THEME_KEY).then((val) => {
      if (val === 'dark' || val === 'light') setPreference(val);
    });
  }, []);

  const isDark = preference !== null ? preference === 'dark' : systemScheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const toggleTheme = async () => {
    const next = isDark ? 'light' : 'dark';
    setPreference(next);
    await SecureStore.setItemAsync(THEME_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
