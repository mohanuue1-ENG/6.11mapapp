import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

export type TabItem<T extends string> = { id: T; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; badge?: number };

// Floating pill with a highlight that slides to the chosen tab, like the switch on the public website.
export default function TabBar<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const slot = width / tabs.length;

  useEffect(() => {
    if (!width) return;
    Animated.timing(x, { toValue: index * slot, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, slot, width, x]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - PAD * 2);

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.bar} onLayout={onLayout}>
        {!!width && <Animated.View style={[s.slider, { width: slot, transform: [{ translateX: x }] }]} />}
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <TouchableOpacity key={t.id} style={[s.tab, { width: slot || undefined, flex: slot ? undefined : 1 }]} onPress={() => onChange(t.id)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <View>
                <Ionicons name={active ? t.activeIcon : t.icon} size={22} color={active ? '#052E16' : colors.muted} />
                {!!t.badge && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{t.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.label, { color: active ? '#052E16' : colors.muted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const PAD = 6;

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 16 },
  bar: { flexDirection: 'row', backgroundColor: 'rgba(16,24,20,0.97)', borderRadius: 30, borderWidth: 1, borderColor: colors.border, padding: PAD, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  slider: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 24, backgroundColor: colors.green },
  tab: { height: 52, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10.5, fontWeight: '800', marginTop: 1 },
  badge: { position: 'absolute', top: -4, right: -9, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
