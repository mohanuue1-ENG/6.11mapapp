import React from 'react';
import { Image, useWindowDimensions, View } from 'react-native';

// The poster is 900 x 1995. It is drawn at exactly the screen width and the height that keeps its shape,
// centred, so on any phone it fills the screen and the logo and title are never cut off.
const RATIO = 1995 / 900;

export default function Splash() {
  const { width, height } = useWindowDimensions();
  const imgH = width * RATIO;
  return (
    <View style={{ flex: 1, backgroundColor: '#000C11', overflow: 'hidden' }}>
      <Image
        source={require('../assets/splash.jpg')}
        style={{ position: 'absolute', left: 0, width, height: imgH, top: (height - imgH) / 2 }}
        resizeMode="stretch"
        accessibilityLabel="6.11 Drive GPS"
      />
    </View>
  );
}
