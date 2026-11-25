import CodeBoxes from '../CodeBoxes';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Press from '../Press';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, checkSignupCode, login, lookupDriverPhone, registerDriver, requestPasswordReset, requestSignupCode, resetPassword, verifyLogin } from '../api';
import { Colors, useTheme } from '../theme';
import { COUNTRIES, Country, flag, joinPhone } from '../countries';

type Step = 'login' | 'code' | 'regNumber' | 'regName' | 'regEmail' | 'regCode' | 'regPassword' | 'fgNumber' | 'fgEmail' | 'fgCode' | 'fgPassword';
// Creating an account, and a forgotten password, are series of small forms, one question each.
const REG_STEPS: Step[] = ['regNumber', 'regName', 'regEmail', 'regCode', 'regPassword'];
const FG_STEPS: Step[] = ['fgNumber', 'fgEmail', 'fgCode', 'fgPassword'];
type IconName = keyof typeof Ionicons.glyphMap;

// The country picked last time is kept for the next time the form opens.
let lastCountry: Country = COUNTRIES.find((c) => c.code === 'US')!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { colors, mode, toggle } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('login');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(lastCountry);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fullPhone = joinPhone(country.dial, phone);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
  const [hint, setHint] = useState('');
  const [devCode, setDevCode] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // `keepCode` is for the steps after the code step: the typed code is still needed at the end.
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

  // ---------------------------------------------------------------- sign in (2 steps)
  const submitLogin = () =>
    run(async () => {
      const result = await login(email.trim(), password);
      if (result.kind === 'signedIn') {
        onSignedIn();
        return;
      }
      setChallengeId(result.challengeId);
      setHint(result.hint);
      setDevCode(result.devCode ?? '');
      go('code');
    });

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

  // ---------------------------------------------------------------- create an account (5 steps)
  // 1. the number the company set for this driver
  const submitNumber = () =>
    run(async () => {
      await lookupDriverPhone(fullPhone);
      go('regName');
    });

  // 2. the name
  const submitName = () => {
    if (name.trim().length < 2) return setError('Enter your full name.');
    go('regEmail');
  };

  // 3. the driver's own email; a code is emailed to it
  const submitEmail = () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    return run(async () => {
      const result = await requestSignupCode(fullPhone, email.trim());
      setHint(result.hint);
      setDevCode(result.devCode ?? '');
      go('regCode');
    });
  };

  const resendSignupCode = () =>
    run(async () => {
      const result = await requestSignupCode(fullPhone, email.trim());
      setDevCode(result.devCode ?? '');
      setCode('');
      setNotice('A new code was sent.');
    });

  // 4. the emailed code is checked here, so a wrong one is found straight away
  const submitRegCode = () =>
    run(async () => {
      await checkSignupCode(email.trim(), code.trim());
      go('regPassword', true);
    });

  // 5. the password, then the account is created with everything collected
  const submitRegister = () => {
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    return run(async () => {
      try {
        await registerDriver({ phone: fullPhone, email: email.trim(), code: code.trim(), name: name.trim(), password, remember });
      } catch (err) {
        // Send the driver back to the step that needs fixing.
        if (err instanceof ApiError && err.code === 'INVALID_CODE') go('regCode');
        else if (err instanceof ApiError && err.status === 409) go(/email/i.test(err.message) ? 'regEmail' : 'regNumber');
        throw err;
      }
      onSignedIn();
    });
  };

  // ---------------------------------------------------------------- forgot password (4 steps)
  // 1. the driver number (not checked yet: the answer must not tell strangers which numbers exist)
  const submitFgNumber = () => {
    if (phone.replace(/\D/g, '').length < 5) return setError('Enter your phone number.');
    go('fgEmail');
  };

  // 2. the email of the account; a code is emailed to it if the two match
  const submitFgEmail = () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    return run(async () => {
      const result = await requestPasswordReset(fullPhone, email.trim());
      setHint(result.hint);
      setDevCode(result.devCode ?? '');
      go('fgCode');
    });
  };

  const resendResetCode = () =>
    run(async () => {
      const result = await requestPasswordReset(fullPhone, email.trim());
      setDevCode(result.devCode ?? '');
      setCode('');
      setNotice('If these details match an account, a new code was sent.');
    });

  // 3. the code
  const submitFgCode = () =>
    run(async () => {
      await checkSignupCode(email.trim(), code.trim(), 'reset');
      go('fgPassword', true);
    });

  // 4. the new password
  const submitReset = () => {
    if (password.length < 8) return setError('Your password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    return run(async () => {
      try {
        await resetPassword({ phone: fullPhone, email: email.trim(), code: code.trim(), newPassword: password });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'INVALID_CODE') go('fgCode');
        throw err;
      }
      setPassword('');
      setConfirm('');
      go('login');
      setNotice('Your password was changed. Sign in with the new password.');
    });
  };

  const startFlow = (next: Step) => {
    setPassword('');
    setConfirm('');
    go(next);
  };

  // ---------------------------------------------------------------- pieces
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
    <Press onPress={() => setShow(!show)} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
      <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
    </Press>
  );

  const rememberRow = (
    <Press style={s.rememberRow} onPress={() => setRemember(!remember)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
      <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={22} color={remember ? colors.accent : colors.muted} />
      <Text style={s.rememberText}>Remember me for 30 days</Text>
    </Press>
  );

  const button = (label: string, onPress: () => void, enabled: boolean) => (
    <Press style={[s.button, (!enabled || busy) && { opacity: 0.5 }]} onPress={onPress} disabled={!enabled || busy} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={s.buttonText}>{label}</Text>}
    </Press>
  );

  const link = (label: string, onPress: () => void) => (
    <Press onPress={onPress} disabled={busy} hitSlop={8} style={{ alignSelf: 'center', marginTop: 16 }}>
      <Text style={s.link}>{label}</Text>
    </Press>
  );

  // The phone number: a country-code picker, then the number.
  const numberField = (onSubmit: () => void) => (
    <View style={[s.field, focus === 'phone' && s.fieldFocus, { paddingLeft: 8 }]}>
      <Press style={s.dialBtn} onPress={() => setPickerOpen(true)} accessibilityLabel={`Country code ${country.name} plus ${country.dial}. Tap to change.`}>
        <Text style={s.dialText}>{flag(country.code)} +{country.dial}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Press>
      <TextInput
        style={s.input}
        placeholder="Phone number"
        placeholderTextColor={colors.placeholder}
        keyboardType="phone-pad"
        autoComplete="tel"
        returnKeyType="go"
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/[^\d\s\-+().]/g, ''))}
        onFocus={() => setFocus('phone')}
        onBlur={() => setFocus('')}
        onSubmitEditing={onSubmit}
      />
    </View>
  );

  const shownCountries = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.code.toLowerCase() === q) : COUNTRIES;
  }, [query]);

  const emailField = (onSubmit: () => void) =>
    field('email', 'mail-outline', {
      placeholder: 'Email (Gmail)',
      autoComplete: 'email',
      keyboardType: 'email-address',
      returnKeyType: 'go',
      value: email,
      onChangeText: setEmail,
      onSubmitEditing: onSubmit,
      autoFocus: true,
    });

  const codeField = <CodeBoxes value={code} onChange={setCode} autoFocus />;

  const passwordFields = (onSubmit: () => void, label: string) => (
    <>
      {field(
        'password',
        'lock-closed-outline',
        { inputRef: passwordRef, placeholder: 'Password (8+ characters)', secureTextEntry: !show, autoComplete: 'new-password', returnKeyType: 'next', value: password, onChangeText: setPassword, onSubmitEditing: () => confirmRef.current?.focus(), autoFocus: true },
        eye,
      )}
      {field('confirm', 'lock-closed-outline', { inputRef: confirmRef, placeholder: 'Repeat password', secureTextEntry: !show, autoComplete: 'new-password', returnKeyType: 'go', value: confirm, onChangeText: setConfirm, onSubmitEditing: onSubmit })}
      {button(label, onSubmit, !!password && !!confirm)}
    </>
  );

  const devNote = !!devCode && <Text style={s.devNote}>Test mode (email is not set up yet): your code is {devCode}</Text>;

  const titles: Record<Step, { title: string; subtitle: string }> = {
    login: { title: 'Driver Login', subtitle: 'Sign in with your email and password.' },
    code: { title: 'Check your email', subtitle: `We emailed a 6-digit code to ${hint}.` },
    regNumber: { title: 'Create your account', subtitle: 'Choose your country and enter the phone number your company added for you.' },
    regName: { title: 'What is your name?', subtitle: 'Your full name.' },
    regEmail: { title: 'Your email', subtitle: 'Enter your own Gmail or email. We will send you a code to confirm it.' },
    regCode: { title: 'Enter the code', subtitle: `We emailed a 6-digit code to ${hint}. It may take a minute; check spam too.` },
    regPassword: { title: 'Choose a password', subtitle: 'At least 8 characters. You will sign in with your email and this password.' },
    fgNumber: { title: 'Forgot password', subtitle: 'Choose your country and enter the phone number your company added for you.' },
    fgEmail: { title: 'Your email', subtitle: 'Enter the email you signed up with.' },
    fgCode: { title: 'Enter the code', subtitle: `If these details match an account, we emailed a 6-digit code to ${hint}.` },
    fgPassword: { title: 'New password', subtitle: 'Choose a new password, at least 8 characters.' },
  };
  const group = REG_STEPS.includes(step) ? REG_STEPS : FG_STEPS.includes(step) ? FG_STEPS : [];
  const stepNumber = group.indexOf(step) + 1;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={s.glow} pointerEvents="none" />
        <Press style={s.modeBtn} onPress={toggle} hitSlop={8} accessibilityLabel={mode === 'night' ? 'Switch to day mode' : 'Switch to night mode'}>
          <Ionicons name={mode === 'night' ? 'sunny-outline' : 'moon-outline'} size={22} color={colors.text} />
        </Press>

        <View style={s.hero}>
          <Image source={require('../../assets/logo.png')} style={s.logo} accessibilityLabel="TRUKOVA" />
          <Text style={s.brand}>TRUKOVA</Text>
          <Text style={s.tagline}>Track · Drive · Manage</Text>
        </View>

        <View style={s.panel}>
          {stepNumber > 0 && (
            <View style={s.progress} accessibilityLabel={`Step ${stepNumber} of ${group.length}`}>
              {group.map((k, i) => (
                <View key={k} style={[s.dot, i < stepNumber && s.dotOn]} />
              ))}
              <Text style={s.stepText}>Step {stepNumber} of {group.length}</Text>
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
              {link('Forgot password?', () => startFlow('fgNumber'))}
              {link('New driver? Create your account', () => startFlow('regNumber'))}
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

          {step === 'regNumber' && (
            <>
              {numberField(submitNumber)}
              {button('Continue', submitNumber, phone.replace(/\D/g, '').length >= 5)}
              {link('I already have an account', () => go('login'))}
              <Text style={s.help}>Your company must have added your phone number first. Ask them if you are not sure.</Text>
            </>
          )}

          {step === 'regName' && (
            <>
              {field('name', 'person-outline', { placeholder: 'Full name', autoCapitalize: 'words', returnKeyType: 'go', value: name, onChangeText: setName, onSubmitEditing: submitName, autoFocus: true })}
              {button('Continue', submitName, name.trim().length >= 2)}
              {link('Back', () => go('regNumber'))}
            </>
          )}

          {step === 'regEmail' && (
            <>
              {emailField(submitEmail)}
              {button('Send code', submitEmail, !!email.trim())}
              {link('Back', () => go('regName'))}
            </>
          )}

          {step === 'regCode' && (
            <>
              {codeField}
              {devNote}
              {button('Continue', submitRegCode, code.length === 6)}
              {link('Send a new code', resendSignupCode)}
              {link('Back', () => go('regEmail'))}
            </>
          )}

          {step === 'regPassword' && (
            <>
              {passwordFields(submitRegister, 'Create account')}
              {rememberRow}
              {link('Back', () => go('regCode', true))}
            </>
          )}

          {step === 'fgNumber' && (
            <>
              {numberField(submitFgNumber)}
              {button('Continue', submitFgNumber, phone.replace(/\D/g, '').length >= 5)}
              {link('Back to login', () => go('login'))}
            </>
          )}

          {step === 'fgEmail' && (
            <>
              {emailField(submitFgEmail)}
              {button('Send code', submitFgEmail, !!email.trim())}
              {link('Back', () => go('fgNumber'))}
            </>
          )}

          {step === 'fgCode' && (
            <>
              {codeField}
              {devNote}
              {button('Continue', submitFgCode, code.length === 6)}
              {link('Send a new code', resendResetCode)}
              {link('Back', () => go('fgEmail'))}
            </>
          )}

          {step === 'fgPassword' && (
            <>
              {passwordFields(submitReset, 'Change password')}
              {link('Back', () => go('fgCode', true))}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)} statusBarTranslucent>
        <View style={s.pickerBackdrop}>
          <Press style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerOpen(false)} accessibilityLabel="Close country list" />
          <View style={s.pickerSheet}>
            <View style={s.grab} />
            <Text style={s.pickerTitle}>Country code</Text>
            <View style={[s.field, { marginHorizontal: 16, marginBottom: 8 }]}>
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <TextInput style={s.input} placeholder="Search country or code" placeholderTextColor={colors.placeholder} value={query} onChangeText={setQuery} autoCorrect={false} />
            </View>
            <FlatList
              data={shownCountries}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = item.code === country.code;
                return (
                  <Press
                    style={[s.countryRow, on && { backgroundColor: colors.surface2 }]}
                    onPress={() => {
                      lastCountry = item;
                      setCountry(item);
                      setPickerOpen(false);
                      setQuery('');
                    }}
                  >
                    <Text style={s.countryFlag}>{flag(item.code)}</Text>
                    <Text style={[s.countryName, on && { fontWeight: '800' }]}>{item.name}</Text>
                    <Text style={s.countryDial}>+{item.dial}</Text>
                  </Press>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
  dialBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.surface2 },
  dialText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '75%', paddingBottom: 20, borderTopWidth: 1, borderColor: colors.border },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 10, marginBottom: 10 },
  pickerTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginHorizontal: 16, marginBottom: 10 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  countryFlag: { fontSize: 22 },
  countryName: { flex: 1, color: colors.text, fontSize: 15 },
  countryDial: { color: colors.muted, fontSize: 14, fontWeight: '700' },
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
