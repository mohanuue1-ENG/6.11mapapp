import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, useWindowDimensions, View } from 'react-native';

// The opening screen: the TRUKOVA logo on white. It fades and grows in gently, holds for a moment, then onDone.
const SHOW_MS = 1800;

export default function Splash({ onDone }: { onDone?: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.62, 340);
  const progress = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const t = setTimeout(() => done.current?.(), SHOW_MS);
    return () => clearTimeout(t);
  }, [progress]);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }}>
        <Image source={require('../assets/logo.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="TRUKOVA" />
      </Animated.View>
    </View>
  );
}
