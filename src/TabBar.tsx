import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, useTheme } from './theme';

export type TabItem<T extends string> = { id: T; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; badge?: number };

// iOS "liquid glass": a frosted, see-through bar with a lens of glass that slides to the chosen tab like a drop
// of water: it springs past the tab, stretches while it travels and settles with a little squash. The icon of the
// chosen tab grows.
export default function TabBar<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const grow = useRef(tabs.map((t) => new Animated.Value(t.id === value ? 1 : 0))).current;
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const slot = width / tabs.length;
  const first = useRef(true);

  useEffect(() => {
    if (!width) return;
    const to = index * slot;
    if (first.current) {
      first.current = false;
      x.setValue(to);
    } else {
      Animated.spring(x, { toValue: to, friction: 7, tension: 120, useNativeDriver: true }).start();
      stretch.setValue(0);
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, friction: 4, tension: 140, useNativeDriver: true }),
      ]).start();
    }
    tabs.forEach((_, i) => Animated.spring(grow[i], { toValue: i === index ? 1 : 0, friction: 5, tension: 160, useNativeDriver: true }).start());
  }, [index, slot, width, x, stretch, grow, tabs]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - PAD * 2);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.shadow}>
        <BlurView intensity={colors.isDark ? 40 : 70} tint={colors.isDark ? 'dark' : 'light'} style={s.bar} onLayout={onLayout}>
          <View style={s.sheen} pointerEvents="none" />
          {!!width && (
            <Animated.View style={[s.lens, { width: slot, transform: [{ translateX: x }, { scaleX }, { scaleY }] }]}>
              <View style={s.glint} />
            </Animated.View>
          )}
          {tabs.map((t, i) => {
            const active = t.id === value;
            const size = grow[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
            return (
              <TouchableOpacity key={t.id} style={[s.tab, { width: slot || undefined, flex: slot ? undefined : 1 }]} onPress={() => onChange(t.id)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Animated.View style={{ transform: [{ scale: size }] }}>
                  <Ionicons name={active ? t.activeIcon : t.icon} size={22} color={active ? colors.accent : colors.muted} />
                  {!!t.badge && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{t.badge}</Text>
                    </View>
                  )}
                </Animated.View>
                <Text style={[s.label, { color: active ? colors.accent : colors.muted }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

const PAD = 6;

const makeStyles = (colors: Colors) => {
  const dark = colors.isDark;
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 16 },
    // the soft shadow under the whole bar (it cannot sit on the clipped blur view)
    shadow: { borderRadius: 32, shadowColor: dark ? '#000' : '#0F172A', shadowOpacity: dark ? 0.55 : 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
    bar: { flexDirection: 'row', padding: PAD, borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)', backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)' },
    // light on the top edge of the glass
    sheen: { position: 'absolute', left: 14, right: 14, top: 1, height: 1.5, borderRadius: 2, backgroundColor: dark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,1)' },
    lens: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 26, backgroundColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,1)', shadowColor: colors.accent, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    // the bright glint on the curve of the drop
    glint: { position: 'absolute', left: '14%', right: '14%', top: 3, height: '34%', borderRadius: 20, backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)' },
    tab: { height: 52, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 10.5, fontWeight: '800', marginTop: 1 },
    badge: { position: 'absolute', top: -4, right: -9, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  });
};
