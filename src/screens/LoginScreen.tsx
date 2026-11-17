import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, checkSignupCode, login, registerDriver, requestSignupCode, verifyLogin } from '../api';
import { Colors, useTheme } from '../theme';

type Step = 'login' | 'code' | 'regPhone' | 'regCode' | 'regName' | 'regEmail' | 'regPassword';
// Creating an account is a series of small forms, one question each.
const REG_STEPS: Step[] = ['regPhone', 'regCode', 'regName', 'regEmail', 'regPassword'];
type IconName = keyof typeof Ionicons.glyphMap;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { colors, mode, toggle } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [phoneHint, setPhoneHint] = useState('');
  const [devCode, setDevCode] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // `keepCode` is for the sign-up steps after the code step: the typed code is still needed at the end.
  const go = (next: Step, keepCode = false) => {
    setStep(next);
    setError('');
    setNotice('');
    if (!keepCode) setCode('');
  };

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'NETWORK'
            ? 'Cannot reach the server. Check your connection.'
            : err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  // Sign in, step 1: email and password.
  const submitLogin = () =>
    run(async () => {
      const result = await login(email.trim(), password);
      if (result.kind === 'signedIn') {
        onSignedIn();
        return;
      }
      setChallengeId(result.challengeId);
      setPhoneHint(result.phoneHint);
      setDevCode(result.devCode ?? '');
      go('code');
    });

  // Sign in, step 2: the texted code.
  const submitCode = () =>
    run(async () => {
      await verifyLogin(challengeId, code.trim(), remember);
      onSignedIn();
    });

  const resendLoginCode = () =>
    run(async () => {
      const result = await login(email.trim(), password);
      if (result.kind === 'signedIn') {
        onSignedIn();
        return;
      }
      setChallengeId(result.challengeId);
      setDevCode(result.devCode ?? '');
      setCode('');
      setNotice('A new code was sent.');
    });

  // New driver, step 1: the phone number the company put on the profile.
  const submitPhone = () =>
    run(async () => {
      const result = await requestSignupCode(phone.trim());
      setPhoneHint(result.phoneHint);
      setDevCode(result.devCode ?? '');
      go('regCode');
    });

  const resendSignupCode = () =>
    run(async () => {
      const result = await requestSignupCode(phone.trim());
      setDevCode(result.devCode ?? '');
      setCode('');
      setNotice('A new code was sent.');
    });

  // New driver, step 2: the texted code is checked here, so a wrong one is found straight away.
  const submitRegCode = () =>
    run(async () => {
      await checkSignupCode(phone.trim(), code.trim());
      go('regName', true);
    });

  // Steps 3 and 4: name and email, checked on the phone.
  const submitName = () => {
    if (name.trim().length < 2) return setError('Enter your full name.');
    go('regEmail', true);
  };
  const submitEmail = () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    go('regPassword', true);
  };

  // Step 5: the password, then the account is created with everything collected.
  const submitRegister = () => {
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    return run(async () => {
      try {
        await registerDriver({ phone: phone.trim(), code: code.trim(), name: name.trim(), email: email.trim(), password, remember });
      } catch (err) {
        // Send the driver back to the step that needs fixing.
        if (err instanceof ApiError && err.code === 'INVALID_CODE') go('regCode');
        else if (err instanceof ApiError && err.status === 409) go('regEmail', true);
        throw err;
      }
      onSignedIn();
    });
  };

  const field = (key: string, icon: IconName, props: TextInputProps & { inputRef?: React.RefObject<TextInput> }, right?: React.ReactNode) => {
    const { inputRef, ...rest } = props;
    return (
      <View style={[s.field, focus === key && s.fieldFocus]}>
        <Ionicons name={icon} size={19} color={focus === key ? colors.accent : colors.muted} />
        <TextInput
          ref={inputRef}
          style={s.input}
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocus(key)}
          onBlur={() => setFocus('')}
          {...rest}
        />
        {right}
      </View>
    );
  };

  const eye = (
    <TouchableOpacity onPress={() => setShow(!show)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
      <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
    </TouchableOpacity>
  );

  const rememberRow = (
    <TouchableOpacity style={s.rememberRow} onPress={() => setRemember(!remember)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
      <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={22} color={remember ? colors.accent : colors.muted} />
      <Text style={s.rememberText}>Remember me for 30 days</Text>
    </TouchableOpacity>
  );

  const button = (label: string, onPress: () => void, enabled: boolean) => (
    <TouchableOpacity style={[s.button, (!enabled || busy) && { opacity: 0.5 }]} onPress={onPress} disabled={!enabled || busy} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={s.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );

  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} disabled={busy} hitSlop={8} style={{ alignSelf: 'center', marginTop: 16 }}>
      <Text style={s.link}>{label}</Text>
    </TouchableOpacity>
  );

  const codeField = field('code', 'chatbubble-ellipses-outline', {
    placeholder: '6-digit code',
    keyboardType: 'number-pad',
    maxLength: 6,
    value: code,
    onChangeText: (v) => setCode(v.replace(/\D/g, '')),
    autoComplete: 'sms-otp',
    textContentType: 'oneTimeCode',
  });

  const devNote = !!devCode && (
    <Text style={s.devNote}>Test mode (no text-message service yet): your code is {devCode}</Text>
  );

  const titles: Record<Step, { title: string; subtitle: string }> = {
    login: { title: 'Driver Login', subtitle: 'Sign in with your email and password.' },
    code: { title: 'Check your phone', subtitle: `We texted a 6-digit code to ${phoneHint}.` },
    regPhone: { title: 'Create your account', subtitle: 'Enter the phone number your company gave for you. We will text you a code.' },
    regCode: { title: 'Enter the code', subtitle: `We texted a 6-digit code to ${phoneHint}.` },
    regName: { title: 'What is your name?', subtitle: 'Your full name, as your company knows you.' },
    regEmail: { title: 'Your email', subtitle: 'You will sign in with this email.' },
    regPassword: { title: 'Choose a password', subtitle: 'At least 8 characters.' },
  };
  const regNumber = REG_STEPS.indexOf(step) + 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={s.glow} pointerEvents="none" />
        <TouchableOpacity style={s.modeBtn} onPress={toggle} hitSlop={8} accessibilityLabel={mode === 'night' ? 'Switch to day mode' : 'Switch to night mode'}>
          <Ionicons name={mode === 'night' ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={s.hero}>
          <Image source={require('../../assets/logo.png')} style={s.logo} accessibilityLabel="TRUKOVA" />
          <Text style={s.brand}>TRUKOVA</Text>
          <Text style={s.tagline}>Track · Drive · Manage</Text>
        </View>

        <View style={s.panel}>
          {regNumber > 0 && (
            <View style={s.progress} accessibilityLabel={`Step ${regNumber} of ${REG_STEPS.length}`}>
              {REG_STEPS.map((k, i) => (
                <View key={k} style={[s.dot, i < regNumber && s.dotOn]} />
              ))}
              <Text style={s.stepText}>Step {regNumber} of {REG_STEPS.length}</Text>
            </View>
          )}
          <Text style={s.title}>{titles[step].title}</Text>
          <Text style={s.subtitle}>{titles[step].subtitle}</Text>

          {!!error && (
            <View style={s.errorBox} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
          {!!notice && <Text style={s.notice}>{notice}</Text>}

          {step === 'login' && (
            <>
              {field('email', 'person-outline', {
                placeholder: 'Email',
                autoComplete: 'email',
                keyboardType: 'email-address',
                returnKeyType: 'next',
                value: email,
                onChangeText: setEmail,
                onSubmitEditing: () => passwordRef.current?.focus(),
              })}
              {field(
                'password',
                'lock-closed-outline',
                { inputRef: passwordRef, placeholder: 'Password', secureTextEntry: !show, autoComplete: 'current-password', returnKeyType: 'go', value: password, onChangeText: setPassword, onSubmitEditing: submitLogin },
                eye,
              )}
              {rememberRow}
              {button('Login', submitLogin, !!email && !!password)}
              {link('New driver? Create your account', () => go('regPhone'))}
              <Text style={s.help}>Forgot your password? Ask your company administrator to reset it.</Text>
            </>
          )}

          {step === 'code' && (
            <>
              {codeField}
              {devNote}
              {rememberRow}
              {button('Verify and sign in', submitCode, code.length === 6)}
              {link('Send a new code', resendLoginCode)}
              {link('Back', () => go('login'))}
            </>
          )}

          {step === 'regPhone' && (
            <>
              {field('phone', 'call-outline', {
                placeholder: 'Phone number, e.g. +252 61 234 5678',
                keyboardType: 'phone-pad',
                autoComplete: 'tel',
                returnKeyType: 'go',
                value: phone,
                onChangeText: setPhone,
                onSubmitEditing: submitPhone,
              })}
              {button('Send code', submitPhone, phone.replace(/\D/g, '').length >= 7)}
              {link('I already have an account', () => go('login'))}
              <Text style={s.help}>Your company must have added your phone number to your driver profile first.</Text>
            </>
          )}

          {step === 'regCode' && (
            <>
              {codeField}
              {devNote}
              {button('Continue', submitRegCode, code.length === 6)}
              {link('Send a new code', resendSignupCode)}
              {link('Back', () => go('regPhone'))}
            </>
          )}

          {step === 'regName' && (
            <>
              {field('name', 'person-outline', { placeholder: 'Full name', autoCapitalize: 'words', returnKeyType: 'go', value: name, onChangeText: setName, onSubmitEditing: submitName, autoFocus: true })}
              {button('Continue', submitName, name.trim().length >= 2)}
              {link('Back', () => go('regCode', true))}
            </>
          )}

          {step === 'regEmail' && (
            <>
              {field('email', 'mail-outline', {
                placeholder: 'Email',
                autoComplete: 'email',
                keyboardType: 'email-address',
                returnKeyType: 'go',
                value: email,
                onChangeText: setEmail,
                onSubmitEditing: submitEmail,
                autoFocus: true,
              })}
              {button('Continue', submitEmail, !!email.trim())}
              {link('Back', () => go('regName', true))}
            </>
          )}

          {step === 'regPassword' && (
            <>
              {field(
                'password',
                'lock-closed-outline',
                { inputRef: passwordRef, placeholder: 'Password (8+ characters)', secureTextEntry: !show, autoComplete: 'new-password', returnKeyType: 'next', value: password, onChangeText: setPassword, onSubmitEditing: () => confirmRef.current?.focus(), autoFocus: true },
                eye,
              )}
              {field('confirm', 'lock-closed-outline', { inputRef: confirmRef, placeholder: 'Repeat password', secureTextEntry: !show, autoComplete: 'new-password', returnKeyType: 'go', value: confirm, onChangeText: setConfirm, onSubmitEditing: submitRegister })}
              {rememberRow}
              {button('Create account', submitRegister, !!password && !!confirm)}
              {link('Back', () => go('regEmail', true))}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 70, paddingBottom: 40 },
  glow: { position: 'absolute', top: -120, left: -60, right: -60, height: 380, borderRadius: 300, backgroundColor: colors.glow },
  modeBtn: { position: 'absolute', top: 46, right: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 96, height: 96, borderRadius: 26, borderWidth: 1.5, borderColor: colors.accentBorder, marginBottom: 18, backgroundColor: '#FFFFFF' },
  brand: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 2 },
  tagline: { color: colors.muted, fontSize: 14, marginTop: 6, letterSpacing: 1 },
  panel: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 22 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 20, lineHeight: 18 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 14, marginBottom: 14 },
  fieldFocus: { borderColor: colors.accent },
  input: { flex: 1, color: colors.text, fontSize: 16, height: '100%' },
  button: { height: 54, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, marginTop: -2 },
  rememberText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 14.5, fontWeight: '700' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  stepText: { color: colors.muted, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  notice: { color: colors.accent, fontSize: 13.5, fontWeight: '600', marginBottom: 12 },
  devNote: { color: colors.amber, fontSize: 12.5, marginBottom: 12, marginTop: -4, lineHeight: 17 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, color: colors.errText, fontSize: 14 },
  help: { color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 18, lineHeight: 18 },
});
