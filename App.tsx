import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { OfflineIntro } from './src/ConnectionScreens';
import { hasSession, setSignedOutHandler } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { ThemeProvider, useTheme } from './src/theme';
import Splash from './src/Splash';

function Root({ themeReady }: { themeReady: boolean }) {
  const { colors } = useTheme();
  const [state, setState] = useState<'loading' | 'signedOut' | 'signedIn'>('loading');
  const [splashDone, setSplashDone] = useState(false);
  // null until we know whether the app was opened without a connection.
  const [startOffline, setStartOffline] = useState<boolean | null>(null);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    NetInfo.fetch()
      .then((s) => setStartOffline(s.isConnected === false))
      .catch(() => setStartOffline(false));
    // The server ended the session (driver deactivated, token reuse): back to login.
    setSignedOutHandler(() => setState('signedOut'));
    hasSession()
      .then((yes) => setState(yes ? 'signedIn' : 'signedOut'))
      .catch(() => setState('signedOut'));
  }, []);

  const ready = splashDone && state !== 'loading' && themeReady && startOffline !== null;
  const showIntro = ready && state === 'signedIn' && startOffline === true && !introDone;

  return (
    <View style={{ flex: 1, backgroundColor: ready ? colors.bg : '#FFFFFF' }}>
      <StatusBar style={ready && colors.isDark ? 'light' : 'dark'} />
      {!ready && <Splash onDone={() => setSplashDone(true)} />}
      {ready && state === 'signedOut' && <LoginScreen onSignedIn={() => setState('signedIn')} />}
      {ready && state === 'signedIn' && !showIntro && <HomeScreen onSignedOut={() => setState('signedOut')} />}
      {showIntro && <OfflineIntro onDone={() => setIntroDone(true)} />}
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
