import React from 'react';
import { Image, Text, View } from 'react-native';
import { colors } from './theme';

// The same mark as the website: the logo image beside "6.11 Drive GPS".
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={require('../assets/logo.jpg')}
        style={{ width: size, height: size, borderRadius: size * 0.28, borderWidth: 1, borderColor: 'rgba(34,197,94,0.5)', backgroundColor: '#080B10' }}
        accessibilityLabel="6.11 Drive GPS"
      />
      <Text style={{ marginLeft: 10, fontSize: size * 0.45, fontWeight: '800', letterSpacing: -0.3, color: '#FFFFFF' }}>
        <Text style={{ color: colors.green }}>6.11</Text> Drive GPS
      </Text>
    </View>
  );
}
