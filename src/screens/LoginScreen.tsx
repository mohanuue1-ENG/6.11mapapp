import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, login } from '../api';
import { colors } from '../theme';

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'NETWORK'
            ? 'Cannot reach the server. Check your connection.'
            : err.message
          : 'Sign in failed. Please try again.',
      );
      setBusy(false);
    }
  };

  const fieldStyle = (name: 'email' | 'password') => [s.field, focus === name && s.fieldFocus];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={s.glow} pointerEvents="none" />

        <View style={s.hero}>
          <Image source={require('../../assets/logo.jpg')} style={s.logo} accessibilityLabel="6.11 Drive GPS" />
          <Text style={s.brand}>
            6.11 <Text style={{ color: colors.green }}>Drive GPS</Text>
          </Text>
          <Text style={s.tagline}>Track · Drive · Manage</Text>
        </View>

        <View style={s.panel}>
          <Text style={s.title}>Driver Login</Text>
          <Text style={s.subtitle}>Use the email and password from your company.</Text>

          {!!error && (
            <View style={s.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={fieldStyle('email')}>
            <Ionicons name="person-outline" size={19} color={focus === 'email' ? colors.green : colors.muted} />
            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocus('email')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          <View style={fieldStyle('password')}>
            <Ionicons name="lock-closed-outline" size={19} color={focus === 'password' ? colors.green : colors.muted} />
            <TextInput
              ref={passwordRef}
              style={s.input}
              placeholder="Password"
              placeholderTextColor="#6B7280"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoComplete="current-password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocus('password')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={submit}
            />
            <TouchableOpacity onPress={() => setShow(!show)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[s.button, (busy || !email || !password) && { opacity: 0.5 }]} onPress={submit} disabled={busy || !email || !password} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#052E16" /> : <Text style={s.buttonText}>Login</Text>}
          </TouchableOpacity>

          <Text style={s.help}>Forgot your password? Ask your company administrator to reset it.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 70 },
  glow: { position: 'absolute', top: -120, left: -60, right: -60, height: 380, borderRadius: 300, backgroundColor: 'rgba(34,197,94,0.10)' },
  hero: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 96, height: 96, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.55)', marginBottom: 18 },
  brand: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: colors.muted, fontSize: 14, marginTop: 6, letterSpacing: 1 },
  panel: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 22 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 20 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 14, marginBottom: 14 },
  fieldFocus: { borderColor: colors.green },
  input: { flex: 1, color: '#FFFFFF', fontSize: 16, height: '100%' },
  button: { height: 54, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { color: '#052E16', fontSize: 16, fontWeight: '800' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, color: '#FCA5A5', fontSize: 14 },
  help: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 18, lineHeight: 18 },
});
