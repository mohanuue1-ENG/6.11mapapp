import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from './theme';

// A code shown in one box per digit. One real input sits on top, so typing, pasting and the phone's
// "one-time code" suggestion keep working; the boxes only show what was typed.
export default function CodeBoxes({ value, onChange, length = 6, autoFocus = false }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const { colors } = useTheme();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const active = Math.min(value.length, length - 1);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ marginVertical: 6 }} accessibilityLabel={`${length}-digit code`}>
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.box, { backgroundColor: colors.surface2, borderColor: focused && i === active ? colors.accent : colors.border }]}>
            <Text style={[styles.digit, { color: colors.text }]}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: { flex: 1, height: 58, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 26, fontWeight: '700' },
  hidden: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
});
