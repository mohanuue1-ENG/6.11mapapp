import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hasSession, setSignedOutHandler } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { ThemeProvider, useTheme } from './src/theme';
import Splash from './src/Splash';

function Root({ themeReady }: { themeReady: boolean }) {
  const { colors } = useTheme();
  const [state, setState] = useState<'loading' | 'signedOut' | 'signedIn'>('loading');
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // The server ended the session (driver deactivated, token reuse): back to login.
    setSignedOutHandler(() => setState('signedOut'));
    hasSession()
      .then((yes) => setState(yes ? 'signedIn' : 'signedOut'))
      .catch(() => setState('signedOut'));
  }, []);

  const ready = splashDone && state !== 'loading' && themeReady;

  return (
    <View style={{ flex: 1, backgroundColor: ready ? colors.bg : '#FFFFFF' }}>
      <StatusBar style={ready && colors.isDark ? 'light' : 'dark'} />
      {!ready && <Splash onDone={() => setSplashDone(true)} />}
      {ready && state === 'signedOut' && <LoginScreen onSignedIn={() => setState('signedIn')} />}
      {ready && state === 'signedIn' && <HomeScreen onSignedOut={() => setState('signedOut')} />}
    </View>
  );
}

export default function App() {
  const [themeReady, setThemeReady] = useState(false);
  const onReady = useCallback(() => setThemeReady(true), []);
  return (
    <ThemeProvider onReady={onReady}>
      <Root themeReady={themeReady} />
    </ThemeProvider>
  );
}
