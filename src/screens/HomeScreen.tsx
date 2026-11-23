import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Press from '../Press';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, DriverProfile, Trip, deleteAccount, endTrip, getProfile, getTrip, listTrips, logout, startTrip } from '../api';
import { clearQueue, pendingCount, readMeta, SyncMeta } from '../queue';
import { flushQueue } from '../sync';
import { currentPermission, getTripFix, setSharingSwitchedOff, sharingSwitchedOff, isTracking, requestTrackingPermission, startTracking, stopTracking, TrackingPermission } from '../location';
import { Colors, useTheme } from '../theme';
import MapView, { MapHandle, MapPosition } from '../MapView';
import Logo from '../Logo';
import TabBar, { TabItem } from '../TabBar';
import { ConnectionCard } from '../ConnectionScreens';

const PROFILE_KEY = 'trukova.profile';
type Tab = 'home' | 'trips' | 'alerts';
type AlertItem = { id: string; level: 'error' | 'warn' | 'info' | 'ok'; title: string; text: string };

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

// Metres between two [latitude, longitude] points.
const metresBetween = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

const miles = (m: number | null | undefined) => (m == null ? null : m / 1609.344);
const tripLine = (t: Trip) =>
  t.status === 'ACTIVE' ? 'In progress' : `${Math.round((t.durationSeconds ?? 0) / 60)} min${t.distanceMeters == null ? '' : ` · ${miles(t.distanceMeters)!.toFixed(1)} mi`}`;

const levelsFor = (colors: Colors): Record<AlertItem['level'], { icon: keyof typeof Ionicons.glyphMap; color: string }> => ({
  error: { icon: 'alert-circle', color: colors.red },
  warn: { icon: 'warning', color: colors.amber },
  info: { icon: 'information-circle', color: colors.blue },
  ok: { icon: 'checkmark-circle', color: colors.accent },
});

export default function HomeScreen({ onSignedOut }: { onSignedOut: () => void }) {
  const { colors, mode, toggle } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const LEVEL = useMemo(() => levelsFor(colors), [colors]);
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<TrackingPermission>('denied');
  const [pending, setPending] = useState(0);
  const [meta, setMeta] = useState<SyncMeta>({ lastSyncAt: null, lastError: null });
  const [online, setOnline] = useState(true);
  const [connCard, setConnCard] = useState<'offline' | 'online' | null>(null);
  const firstNet = useRef(true);
  const lastNet = useRef(true);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState('');
  const [recent, setRecent] = useState<Trip[]>([]);
  const [shareError, setShareError] = useState('');
  const [modeNote, setModeNote] = useState('');
  const [pos, setPos] = useState<MapPosition | null>(null);
  const [posError, setPosError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const confirmDelete = async () => {
    if (!deletePw || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteErr('');
    try {
      await deleteAccount(deletePw);
      await stopTracking();
      await setSharingSwitchedOff(false);
      await clearQueue();
      await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
      setDeleteOpen(false);
      onSignedOut();
    } catch (err) {
      setDeleteErr(err instanceof ApiError ? err.message : 'Could not delete the account. Check your connection.');
    } finally {
      setDeleteBusy(false);
    }
  };

  // A trip from the history, shown on the map with its route. `route` is null while it loads.
  const [tripView, setTripView] = useState<{ trip: Trip; route: [number, number][] | null; error?: string } | null>(null);
  const openTrip = async (t: Trip) => {
    setTripView({ trip: t, route: null });
    try {
      const { route: saved } = await getTrip(t.id);
      const pts = saved.map((p) => [p.latitude, p.longitude] as [number, number]);
      setTripView((v) => (v && v.trip.id === t.id ? { ...v, route: pts } : v));
    } catch {
      setTripView((v) => (v && v.trip.id === t.id ? { ...v, route: [], error: 'Could not load this route. Check your connection.' } : v));
    }
  };
  const bigMap = useRef<MapHandle>(null);

  // The route line. It starts when a trip starts, picks up what the server already recorded (for example after the
  // app was reopened), and grows with every new position of the phone.
  const [route, setRoute] = useState<[number, number][]>([]);
  const tripId = profile?.activeTrip?.id ?? null;
  useEffect(() => {
    setRoute([]);
    if (!tripId) return undefined;
    let alive = true;
    getTrip(tripId)
      .then(({ route: saved }) => {
        if (alive && saved.length) setRoute((now) => [...saved.map((p) => [p.latitude, p.longitude] as [number, number]), ...now]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tripId]);
  useEffect(() => {
    if (!tripId || !pos) return;
    const here: [number, number] = [pos.latitude, pos.longitude];
    setRoute((now) => {
      const last = now[now.length - 1];
      return last && metresBetween(last, here) < 5 ? now : [...now, here];
    });
  }, [tripId, pos?.latitude, pos?.longitude]);

  const refreshStatus = useCallback(async () => {
    setTracking(await isTracking());
    setPermission(await currentPermission());
    setPending(await pendingCount());
    setMeta(await readMeta());
  }, []);

  // Points waiting to send means the connection is not working: show the offline
  // card, and the back online card once they have all gone out.
  const prevPending = useRef(0);
  useEffect(() => {
    const before = prevPending.current;
    prevPending.current = pending;
    if (before === 0 && pending > 0 && lastNet.current) {
      lastNet.current = false;
      setConnCard('offline');
    } else if (before > 0 && pending === 0 && !lastNet.current) {
      lastNet.current = true;
      setConnCard('online');
    }
  }, [pending]);

  const loadProfile = useCallback(async () => {
    // No connection: do not wait for a request to time out. Show the saved
    // profile at once and the "You are offline" notice.
    const net = await NetInfo.fetch().catch(() => null);
    if (net && net.isConnected === false) {
      setOnline(false);
      setProfileError('');
      const saved = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
      if (saved) {
        try {
          setProfile((now) => now ?? (JSON.parse(saved) as DriverProfile));
        } catch {}
      }
      return;
    }
    try {
      const fresh = await getProfile();
      setProfile(fresh);
      setProfileError('');
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(fresh)).catch(() => {});
      listTrips(20).then((r) => setRecent(r.trips)).catch(() => {});
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setProfileError('Could not load your truck. Check your connection.');
        // Offline: show what was saved the last time it loaded instead of blanks.
        const saved = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
        if (saved) {
          try {
            setProfile((now) => now ?? (JSON.parse(saved) as DriverProfile));
          } catch {}
        }
      }
    }
  }, []);

  useEffect(() => {
    loadProfile();
    refreshStatus();
    flushQueue().then(refreshStatus);
    const timer = setInterval(refreshStatus, 3000);
    // When the connection returns or the app comes to the front, upload what was queued offline.
    let settle: ReturnType<typeof setTimeout> | null = null;
    const net = NetInfo.addEventListener((s) => {
      const on = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(on);
      if (on) flushQueue().then(refreshStatus);
      // The first event only reports the state the app started in. After that, a
      // change that holds for a moment shows the offline / back online card
      // (the wait ignores the brief flicker while a connection switches).
      if (firstNet.current) {
        firstNet.current = false;
        lastNet.current = on;
        return;
      }
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        if (on !== lastNet.current) {
          lastNet.current = on;
          setConnCard(on ? 'online' : 'offline');
        }
      }, 700);
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        loadProfile();
        flushQueue().then(refreshStatus);
      }
    });
    return () => {
      clearInterval(timer);
      if (settle) clearTimeout(settle);
      net();
      app.remove();
    };
  }, [loadProfile, refreshStatus]);

  const toggleTracking = async () => {
    setShareError('');
    try {
      if (tracking) {
        await setSharingSwitchedOff(true);
        await stopTracking();
        setModeNote('');
      } else {
        await setSharingSwitchedOff(false);
        const granted = await requestTrackingPermission();
        if (granted === 'denied') {
          Alert.alert('Location needed', 'Allow location access in Settings to share your truck position.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
        } else {
          const mode = await startTracking();
          setModeNote(mode === 'foreground' ? 'Works while the app is open' : '');
        }
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not start location sharing.');
    }
    refreshStatus();
  };

  // Sharing turns on by itself once the driver has a truck and location is allowed, unless it was switched off on purpose.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !profile?.truck) return;
    autoStarted.current = true;
    (async () => {
      try {
        if ((await isTracking()) || (await sharingSwitchedOff())) return;
        const granted = await requestTrackingPermission();
        if (granted === 'denied') return;
        const mode = await startTracking();
        setModeNote(mode === 'foreground' ? 'Works while the app is open' : '');
      } catch {
        // The driver can still start it with the button; the Alerts tab explains what is wrong.
      }
      refreshStatus();
    })();
  }, [profile?.truck, refreshStatus]);

  // Start / end use a fresh GPS fix from the phone. If it cannot get one, nothing is sent and the driver can retry.
  const beginTrip = async () => {
    if (tripBusy) return;
    setTripBusy(true);
    setTripError('');
    try {
      const fix = await getTripFix();
      await startTrip(fix);
      await loadProfile();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACTIVE_TRIP') await loadProfile();
      else setTripError(err instanceof ApiError && err.code === 'NETWORK' ? 'No connection. Try again when you are online.' : err instanceof Error ? err.message : 'Could not start the trip.');
    } finally {
      setTripBusy(false);
    }
  };

  const finishTrip = () => {
    const trip = profile?.activeTrip;
    if (!trip || tripBusy) return;
    Alert.alert('End this trip?', 'Your position and the time will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End trip',
        style: 'destructive',
        onPress: async () => {
          setTripBusy(true);
          setTripError('');
          try {
            // Upload the route points recorded so far first, so the distance is complete.
            await flushQueue();
            const fix = await getTripFix();
            await endTrip(trip.id, fix);
            await loadProfile();
            await refreshStatus();
          } catch (err) {
            setTripError(err instanceof ApiError && err.code === 'NETWORK' ? 'No connection. Try again when you are online.' : err instanceof Error ? err.message : 'Could not end the trip.');
          } finally {
            setTripBusy(false);
          }
        },
      },
    ]);
  };

  const signOut = () => {
    const warn = pending > 0 ? `\n\n${pending} location points have not been uploaded yet and will be lost.` : '';
    Alert.alert('Sign out?', `Location sharing will stop.${warn}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await stopTracking();
          await setSharingSwitchedOff(false);
          await logout();
          await clearQueue();
          await AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
          onSignedOut();
        },
      },
    ]);
  };

  const firstName = profile?.driver.name.split(' ')[0] ?? '';
  const truckShort = profile?.truck ? `TR-${profile.truck.truckNumber}` : profile ? 'No truck' : ' ';
  const truckLabel = profile?.truck ? `Truck #${profile.truck.truckNumber}${profile.truck.plateNumber ? ` · ${profile.truck.plateNumber}` : ''}` : profile ? 'No truck assigned' : 'Loading…';
  const mph = pos?.speedMps != null ? Math.round(pos.speedMps * 2.23694) : null;
  const todayMiles = recent
    .filter((t) => new Date(t.startedAt).toDateString() === new Date().toDateString())
    .reduce((sum, t) => sum + (miles(t.distanceMeters) ?? 0), 0);

  // Things that need the driver's attention, shown on the Alerts tab.
  const alerts: AlertItem[] = [];
  if (profileError) alerts.push({ id: 'profile', level: 'error', title: 'Cannot reach the server', text: profileError });
  if (permission === 'denied') alerts.push({ id: 'perm', level: 'error', title: 'Location access is off', text: 'Turn it on in the phone’s settings so your company can see your truck.' });
  if (permission === 'foreground-only' && tracking) alerts.push({ id: 'perm-fg', level: 'warn', title: 'Tracking works only while the app is open', text: 'For tracking with the screen off, choose “Always” in the phone’s location settings.' });
  if (profile && !profile.truck) alerts.push({ id: 'truck', level: 'warn', title: 'No truck assigned', text: 'Ask your company administrator to assign a truck. Location cannot be recorded until you have one.' });
  if (!online) alerts.push({ id: 'offline', level: 'warn', title: 'You are offline', text: 'Locations are saved on the phone and sent when the connection returns.' });
  else if (pending > 0) alerts.push({ id: 'pending', level: 'warn', title: `${pending} location${pending === 1 ? '' : 's'} waiting to send`, text: meta.lastError || 'They will be sent automatically.' });
  if (!tracking && permission !== 'denied') alerts.push({ id: 'off', level: 'info', title: 'Location sharing is off', text: 'Start sharing on the Home tab so your company can see your truck.' });
  const needsAttention = alerts.filter((a) => a.level === 'error' || a.level === 'warn').length;

  const syncLine = !online ? 'Offline' : pending > 0 ? `${pending} waiting to send` : meta.lastSyncAt ? `Last update: ${ago(meta.lastSyncAt)}` : 'Waiting for first update';

  // ---------- Home ----------
  const homeTab = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <View style={{ marginBottom: 18 }}>
        <Text style={s.hello}>{profile ? `Hello, ${firstName}` : ' '}</Text>
        <Text style={s.sub}>{truckShort}{profile ? ` · ${profile.company.name}` : ''}</Text>
        {(!online || !!profileError) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 8, backgroundColor: colors.amber + '33', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.amber} />
            <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '600' }}>Offline</Text>
          </View>
        )}
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <View style={[s.row, { flex: 1 }]}>
            <View style={[s.statusDot, { backgroundColor: tracking ? colors.accent : colors.neutralDot }]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={s.cardTitle}>{tracking ? 'Tracking Active' : 'Tracking Off'}</Text>
              <Text style={s.sub} numberOfLines={1}>{tracking ? syncLine : 'Your company cannot see your truck'}</Text>
            </View>
          </View>
          <Press style={[s.chip, tracking ? s.chipOff : s.chipOn]} onPress={toggleTracking} activeOpacity={0.85}>
            <Text style={[s.chipText, { color: tracking ? colors.text : colors.onAccent }]}>{tracking ? 'Stop' : 'Start'}</Text>
          </Press>
        </View>
        {!!modeNote && tracking && <Text style={s.warn}>{modeNote}</Text>}
        {!!shareError && <Text style={s.err}>{shareError}</Text>}
      </View>

      <View style={[s.row, { gap: 12, marginBottom: 12 }]}>
        <View style={[s.card, s.stat]}>
          <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
          <Text style={s.statValue}>{mph ?? '–'}<Text style={s.statUnit}> mph</Text></Text>
          <Text style={s.sub}>Speed</Text>
        </View>
        <View style={[s.card, s.stat]}>
          <Ionicons name="navigate-outline" size={20} color={colors.accent} />
          <Text style={s.statValue}>{todayMiles.toFixed(0)}<Text style={s.statUnit}> mi</Text></Text>
          <Text style={s.sub}>Today</Text>
        </View>
      </View>

      <Press style={[s.card, { padding: 0, overflow: 'hidden' }]} activeOpacity={0.9} onPress={() => setMapOpen(true)} accessibilityLabel="Open the map">
        <View style={{ height: 190 }}>
          <MapView interactive={false} route={route} style={StyleSheet.absoluteFill} onPosition={(p, e) => { setPos(p); setPosError(e ?? ''); }} />
        </View>
        <View style={[s.row, s.mapFooter]}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Your location</Text>
            <Text style={s.sub} numberOfLines={1}>{pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}` : posError || 'Finding your position…'}</Text>
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>Open map</Text>
            <Ionicons name="expand-outline" size={16} color={colors.accent} />
          </View>
        </View>
      </Press>

      {profile?.activeTrip ? (
        <Press style={[s.cta, { backgroundColor: colors.red }, tripBusy && { opacity: 0.6 }]} onPress={finishTrip} disabled={tripBusy} activeOpacity={0.85}>
          <Text style={[s.ctaText, { color: '#fff' }]}>{tripBusy ? 'Please wait…' : 'End Trip'}</Text>
        </Press>
      ) : (
        <Press style={[s.cta, (tripBusy || !profile?.truck) && { opacity: 0.5 }]} onPress={beginTrip} disabled={tripBusy || !profile?.truck} activeOpacity={0.85}>
          <Text style={s.ctaText}>{tripBusy ? 'Getting GPS position…' : 'Start Trip'}</Text>
        </Press>
      )}
      {!!tripError && <Text style={s.err}>{tripError}</Text>}
      <Text style={s.hint}>Do not use the app while driving.</Text>
    </ScrollView>
  );

  // ---------- Trips ----------
  const tripsTab = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Trips</Text>
      <View style={s.card}>
        <Text style={s.label}>CURRENT TRIP</Text>
        {profile?.activeTrip ? (
          <>
            <Text style={[s.cardTitle, { color: colors.accent }]}>● In progress</Text>
            <Text style={s.sub}>Started {new Date(profile.activeTrip.startedAt).toLocaleTimeString()}</Text>
          </>
        ) : (
          <Text style={s.cardTitle}>No active trip</Text>
        )}
        {profile?.activeTrip ? (
          <Press style={[s.cta, { backgroundColor: colors.red, marginTop: 14 }, tripBusy && { opacity: 0.6 }]} onPress={finishTrip} disabled={tripBusy}>
            <Text style={[s.ctaText, { color: '#fff' }]}>{tripBusy ? 'Please wait…' : 'End Trip'}</Text>
          </Press>
        ) : (
          <Press style={[s.cta, { marginTop: 14 }, (tripBusy || !profile?.truck) && { opacity: 0.5 }]} onPress={beginTrip} disabled={tripBusy || !profile?.truck}>
            <Text style={s.ctaText}>{tripBusy ? 'Getting GPS position…' : 'Start Trip'}</Text>
          </Press>
        )}
        {!!tripError && <Text style={s.err}>{tripError}</Text>}
      </View>

      <Text style={[s.label, { marginLeft: 4, marginTop: 6 }]}>HISTORY</Text>
      {recent.length === 0 ? (
        <View style={s.card}><Text style={s.sub}>No trips yet.</Text></View>
      ) : (
        recent.map((t) => (
          <Press key={t.id} style={s.card} activeOpacity={0.8} onPress={() => openTrip(t)} accessibilityRole="button" accessibilityLabel="Show this trip on the map">
            <View style={s.row}>
              <Text style={s.cardTitle}>{new Date(t.startedAt).toLocaleDateString()}</Text>
              <Text style={{ color: t.status === 'ACTIVE' ? colors.accent : colors.muted, fontWeight: '700', fontSize: 12 }}>{t.status === 'ACTIVE' ? 'LIVE' : 'COMPLETED'}</Text>
            </View>
            <Text style={s.sub}>Truck #{t.truck.truckNumber} · {tripLine(t)}</Text>
            <Text style={[s.sub, { color: colors.accent, fontWeight: '700', marginTop: 8 }]}>View route on map ›</Text>
          </Press>
        ))
      )}
    </ScrollView>
  );

  // ---------- Alerts ----------
  const alertsTab = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Alerts</Text>
      {(alerts.length ? alerts : [{ id: 'ok', level: 'ok' as const, title: 'Everything looks good', text: 'Location is on and all locations were sent.' }]).map((a) => (
        <View key={a.id} style={[s.card, s.row, { alignItems: 'flex-start' }]}>
          <Ionicons name={LEVEL[a.level].icon} size={24} color={LEVEL[a.level].color} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.cardTitle}>{a.title}</Text>
            <Text style={[s.sub, { marginTop: 4, lineHeight: 18 }]}>{a.text}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  // ---------- Profile (opened from the top bar) ----------
  const initial = (profile?.driver.name ?? '?').trim().charAt(0).toUpperCase();
  const detail = (label: string, value: string | null | undefined) => (
    <View style={s.detailRow} key={label}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value && value.trim() ? value : '–'}</Text>
    </View>
  );
  const truckName = profile?.truck ? [profile.truck.make, profile.truck.model].filter(Boolean).join(' ') : '';
  const profileSheet = (
    <Modal visible={profileOpen} transparent animationType="slide" onRequestClose={() => setProfileOpen(false)} statusBarTranslucent>
      <View style={s.profileBackdrop}>
        <Press style={{ flex: 1 }} activeOpacity={1} onPress={() => setProfileOpen(false)} accessibilityLabel="Close profile" />
        <View style={s.profileSheet}>
          <View style={s.grab} />
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View style={[s.avatar, { width: 76, height: 76, borderRadius: 38 }]}><Text style={[s.avatarText, { fontSize: 32 }]}>{initial}</Text></View>
              <Text style={[s.cardTitle, { fontSize: 20, marginTop: 12 }]}>{profile?.driver.name ?? '…'}</Text>
              <Text style={s.sub}>{profile?.company.name ?? ' '}</Text>
            </View>

            <View style={s.card}>
              <Text style={s.label}>DRIVER</Text>
              {detail('Name', profile?.driver.name)}
              {detail('Driver number', profile?.driver.driverNumber)}
              {detail('Phone', profile?.driver.phone)}
              {detail('Company', profile?.company.name)}
            </View>

            <View style={s.card}>
              <Text style={s.label}>ASSIGNED TRUCK</Text>
              {profile?.truck ? (
                <>
                  {detail('Truck number', `#${profile.truck.truckNumber}`)}
                  {detail('Plate', profile.truck.plateNumber)}
                  {detail('Make / model', truckName)}
                </>
              ) : (
                <Text style={s.cardTitle}>{profile ? 'No truck assigned' : 'Loading…'}</Text>
              )}
            </View>

            <View style={s.card}>
              <Text style={s.label}>STATUS</Text>
              {detail('Location sharing', tracking ? 'On' : 'Off')}
              {detail('Sync', syncLine)}
              {detail('Current trip', profile?.activeTrip ? `In progress · since ${new Date(profile.activeTrip.startedAt).toLocaleTimeString()}` : 'No active trip')}
            </View>

            <Press style={s.signOut} onPress={() => { setProfileOpen(false); signOut(); }} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={20} color={colors.red} />
              <Text style={{ color: colors.red, fontWeight: '800', fontSize: 15, marginLeft: 8 }}>Sign out</Text>
            </Press>
            <Press onPress={() => { setDeletePw(''); setDeleteErr(''); setProfileOpen(false); setDeleteOpen(true); }} style={{ alignItems: 'center', padding: 14, marginTop: 6 }} accessibilityRole="button">
              <Text style={{ color: colors.muted, fontSize: 13, textDecorationLine: 'underline' }}>Delete account</Text>
            </Press>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const deleteSheet = (
    <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: 20 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Delete your account?</Text>
          <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
            Your sign-in, email and phone number are removed and you will not be able to sign in again. Trips you drove stay with your company. This cannot be undone.
          </Text>
          <TextInput
            value={deletePw}
            onChangeText={(v) => { setDeletePw(v); setDeleteErr(''); }}
            placeholder="Your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            style={{ marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text }}
          />
          {!!deleteErr && <Text style={{ color: colors.red, marginTop: 8 }}>{deleteErr}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
            <Press onPress={() => setDeleteOpen(false)} style={{ padding: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
            </Press>
            <Press onPress={confirmDelete} disabled={!deletePw || deleteBusy} style={{ padding: 12, opacity: !deletePw || deleteBusy ? 0.5 : 1 }}>
              <Text style={{ color: colors.red, fontWeight: '800' }}>{deleteBusy ? 'Deleting…' : 'Delete account'}</Text>
            </Press>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ---------- A trip from the history, on the map ----------
  const tripSheet = (
    <Modal visible={!!tripView} animationType="slide" onRequestClose={() => setTripView(null)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {!!tripView?.route?.length && <MapView fitRoute route={tripView.route} style={StyleSheet.absoluteFill} />}
        <View style={s.mapTop}>
          <View style={s.mapPill}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{tripView ? new Date(tripView.trip.startedAt).toLocaleDateString() : ''}</Text>
          </View>
          <Press style={s.roundBtn} onPress={() => setTripView(null)} accessibilityLabel="Close trip">
            <Ionicons name="close" size={22} color={colors.text} />
          </Press>
        </View>
        {!!tripView && (
          <View style={s.mapSheet}>
            <Text style={s.cardTitle}>Truck #{tripView.trip.truck.truckNumber}</Text>
            <View style={[s.row, { marginTop: 12, alignItems: 'flex-start' }]}>
              <View>
                <Text style={s.label}>DURATION</Text>
                <Text style={s.cardTitle}>{tripView.trip.status === 'ACTIVE' ? 'In progress' : `${Math.round((tripView.trip.durationSeconds ?? 0) / 60)} min`}</Text>
              </View>
              <View>
                <Text style={s.label}>DISTANCE</Text>
                <Text style={s.cardTitle}>{tripView.trip.distanceMeters == null ? '–' : `${miles(tripView.trip.distanceMeters)!.toFixed(1)} mi`}</Text>
              </View>
              <View>
                <Text style={s.label}>STARTED</Text>
                <Text style={s.cardTitle}>{new Date(tripView.trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <View>
                <Text style={s.label}>ENDED</Text>
                <Text style={s.cardTitle}>{tripView.trip.endedAt ? new Date(tripView.trip.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}</Text>
              </View>
            </View>
            <Text style={[s.sub, { marginTop: 14 }]}>
              {tripView.route === null
                ? 'Loading the route…'
                : tripView.route.length === 0
                  ? tripView.error ?? 'No route points were recorded for this trip.'
                  : 'Blue line: where you drove. Blue dot: start. Red dot: end.'}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );

  const tabs: TabItem<Tab>[] = [
    { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { id: 'trips', label: 'Trips', icon: 'git-branch-outline', activeIcon: 'git-branch' },
    { id: 'alerts', label: 'Alerts', icon: 'notifications-outline', activeIcon: 'notifications', badge: needsAttention || undefined },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.topBar}>
        <Logo size={36} />
        <View style={s.row}>
          <Press style={s.modeBtn} onPress={toggle} hitSlop={8} accessibilityLabel={mode === 'night' ? 'Switch to day mode' : 'Switch to night mode'}>
            <Ionicons name={mode === 'night' ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.text} />
          </Press>
          <Press style={[s.avatar, { width: 42, height: 42, borderRadius: 21 }]} onPress={() => setProfileOpen(true)} hitSlop={6} accessibilityLabel="Open profile">
            <Text style={[s.avatarText, { fontSize: 18 }]}>{initial}</Text>
          </Press>
        </View>
      </View>
      <View style={{ flex: 1 }}>{tab === 'home' ? homeTab : tab === 'trips' ? tripsTab : alertsTab}</View>
      <TabBar tabs={tabs} value={tab} onChange={setTab} />
      {profileSheet}
      {deleteSheet}
      {tripSheet}
      {connCard && <ConnectionCard key={connCard} kind={connCard} onDone={() => setConnCard(null)} />}

      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <MapView ref={bigMap} route={route} style={StyleSheet.absoluteFill} onPosition={(p, e) => { setPos(p); setPosError(e ?? ''); }} />
          <View style={s.mapTop}>
            <View style={s.mapPill}><Logo size={26} /></View>
            <Press style={s.roundBtn} onPress={() => setMapOpen(false)} accessibilityLabel="Close map"><Ionicons name="close" size={22} color={colors.text} /></Press>
          </View>
          <View style={s.mapSheet}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{truckLabel}</Text>
                <Text style={s.sub}>{pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}${pos.accuracy != null ? ` · ±${Math.round(pos.accuracy)} m` : ''}` : posError || 'Finding your position…'}</Text>
              </View>
              <View style={[s.row, { gap: 6 }]}>
                <View style={[s.statusDot, { backgroundColor: tracking ? colors.accent : colors.neutralDot }]} />
                <Text style={{ color: tracking ? colors.accent : colors.muted, fontWeight: '700', fontSize: 12 }}>{tracking ? 'Sharing' : 'Not sharing'}</Text>
              </View>
            </View>
            <Press style={[s.cta, { marginTop: 14 }, tracking && { backgroundColor: colors.surface2 }]} onPress={toggleTracking} activeOpacity={0.85}>
              <Text style={[s.ctaText, tracking && { color: colors.text }]}>{tracking ? 'Stop sharing' : 'Start sharing location'}</Text>
            </Press>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  page: { padding: 18, paddingTop: 10, paddingBottom: 130 },
  topBar: { paddingTop: 48, paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 16 },
  hello: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.7, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modeBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  profileBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  profileSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%', borderTopWidth: 1, borderColor: colors.border },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.muted, flex: 1 },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1.4, textAlign: 'right' },
  miniLogo: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: '#FFFFFF' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: colors.onAccent },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  chip: { height: 36, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  chipOn: { backgroundColor: colors.accent },
  chipOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipText: { fontWeight: '800', fontSize: 13 },
  stat: { flex: 1, marginBottom: 0, alignItems: 'flex-start' },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 8 },
  statUnit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  mapFooter: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { color: colors.onAccent, fontSize: 17, fontWeight: '800' },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 12 },
  warn: { color: colors.amber, fontSize: 13, marginTop: 10 },
  err: { color: colors.errText, fontSize: 13, marginTop: 10 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.45)', backgroundColor: 'rgba(239,68,68,0.1)', marginTop: 8 },
  mapTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mapPill: { backgroundColor: colors.overlay, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  roundBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mapSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, borderTopWidth: 1, borderColor: colors.border },
});
