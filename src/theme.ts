import { StyleSheet } from 'react-native';

// Night palette from the product mockup: near-black green surfaces with the 6.11 green accent.
export const colors = {
  green: '#22C55E',
  greenDark: '#15803D',
  bg: '#080D0B',
  surface: '#101814',
  surface2: '#16211B',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#3B82F6',
  border: '#1E2B24',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, padding: 20, paddingTop: 64 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 4 },
  value: { fontSize: 16, fontWeight: '600', color: colors.text },
  error: { color: colors.red, marginBottom: 12 },
});
