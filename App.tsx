import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hasSession, setSignedOutHandler } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { colors } from './src/theme';
import Splash from './src/Splash';

export default function App() {
  const [state, setState] = useState<'loading' | 'signedOut' | 'signedIn'>('loading');

  const [minTimeDone, setMinTimeDone] = useState(false);
  useEffect(() => {
    // Keep the first screen visible long enough to be seen.
    const t = setTimeout(() => setMinTimeDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // The server ended the session (driver deactivated, token reuse): back to login.
    setSignedOutHandler(() => setState('signedOut'));
    hasSession()
      .then((yes) => setState(yes ? 'signedIn' : 'signedOut'))
      .catch(() => setState('signedOut'));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {(state === 'loading' || !minTimeDone) && <Splash />}
      {minTimeDone && state === 'signedOut' && <LoginScreen onSignedIn={() => setState('signedIn')} />}
      {minTimeDone && state === 'signedIn' && <HomeScreen onSignedOut={() => setState('signedOut')} />}
    </View>
  );
}
