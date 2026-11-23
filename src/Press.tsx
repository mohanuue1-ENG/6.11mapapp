import React, { useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  // How faint the button goes while it is held (1 = no change).
  activeOpacity?: number;
};

// A button that feels pressed: it squashes a little the moment the finger lands (60 ms, so the answer
// is immediate) and springs back past its size when the finger lifts. The hit area is 8 px larger than
// the button on every side, so a thumb does not have to be exact.
export default function Press({ style, activeOpacity = 0.9, hitSlop = 8, onPressIn, onPressOut, disabled, children, ...rest }: PressProps) {
  const v = useRef(new Animated.Value(0)).current;
  const [down, setDown] = useState(false);
  const scaleX = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const scaleY = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] });

  const pressIn = (e: GestureResponderEvent) => {
    setDown(true);
    Animated.timing(v, { toValue: 1, duration: 60, useNativeDriver: true }).start();
    onPressIn?.(e);
  };
  const pressOut = (e: GestureResponderEvent) => {
    setDown(false);
    Animated.spring(v, { toValue: 0, friction: 4, tension: 260, useNativeDriver: true }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[style, { opacity: down && !disabled ? activeOpacity : 1, transform: [{ scaleX }, { scaleY }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
