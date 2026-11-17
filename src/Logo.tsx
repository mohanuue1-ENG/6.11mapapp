import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from './theme';

// The TRUKOVA mark beside the name.
export default function Logo({ size = 40 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('../assets/logo.png')}
        style={{ width: size, height: size, borderRadius: size * 0.28, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: '#FFFFFF' }}
        accessibilityLabel="TRUKOVA"
      />
      <Text style={{ marginLeft: 10, fontSize: size * 0.45, fontWeight: '800', letterSpacing: 1, color: colors.text }}>TRUKOVA</Text>
    </View>
  );
}
