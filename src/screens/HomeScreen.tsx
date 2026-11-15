import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { ApiError, DriverProfile, Trip, endTrip, getProfile, listTrips, logout, startTrip } from '../api';
import { clearQueue, pendingCount, readMeta, SyncMeta } from '../queue';
import { flushQueue } from '../sync';
import { currentPermission, getTripFix, setSharingSwitchedOff, sharingSwitchedOff, isTracking, requestTrackingPermission, startTracking, stopTracking, TrackingPermission } from '../location';
import { colors } from '../theme';
import MapView, { MapHandle, MapPosition } from '../MapView';
import Logo from '../Logo';
import TabBar, { TabItem } from '../TabBar';

type Tab = 'home' | 'trips' | 'alerts' | 'profile';
type AlertItem = { id: string; level: 'error' | 'warn' | 'info' | 'ok'; title: string; text: string };

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

const miles = (m: number | null | undefined) => (m == null ? null : m / 1609.344);
const tripLine = (t: Trip) =>
  t.status === 'ACTIVE' ? 'In progress' : `${Math.round((t.durationSeconds ?? 0) / 60)} min${t.distanceMeters == null ? '' : ` · ${miles(t.distanceMeters)!.toFixed(1)} mi`}`;

const LEVEL: Record<AlertItem['level'], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  error: { icon: 'alert-circle', color: colors.red },
  warn: { icon: 'warning', color: colors.amber },
  info: { icon: 'information-circle', color: colors.blue },
  ok: { icon: 'checkmark-circle', color: colors.green },
};

export default function HomeScreen({ onSignedOut }: { onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<TrackingPermission>('denied');
  const [pending, setPending] = useState(0);
  const [meta, setMeta] = useState<SyncMeta>({ lastSyncAt: null, lastError: null });
  const [online, setOnline] = useState(true);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState('');
  const [recent, setRecent] = useState<Trip[]>([]);
  const [shareError, setShareError] = useState('');
  const [modeNote, setModeNote] = useState('');
  const [pos, setPos] = useState<MapPosition | null>(null);
  const [posError, setPosError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const bigMap = useRef<MapHandle>(null);

  const refreshStatus = useCallback(async () => {
    setTracking(await isTracking());
    setPermission(await currentPermission());
    setPending(await pendingCount());
    setMeta(await readMeta());
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await getProfile());
      setProfileError('');
      listTrips(20).then((r) => setRecent(r.trips)).catch(() => {});
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) setProfileError('Could not load your truck. Check your connection.');
    }
  }, []);

  useEffect(() => {
    loadProfile();
    refreshStatus();
    flushQueue().then(refreshStatus);
    const timer = setInterval(refreshStatus, 3000);
    // When the connection returns or the app comes to the front, upload what was queued offline.
    const net = NetInfo.addEventListener((s) => {
      setOnline(!!s.isConnected);
      if (s.isConnected) flushQueue().then(refreshStatus);
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        loadProfile();
        flushQueue().then(refreshStatus);
      }
    });
    return () => {
      clearInterval(timer);
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
      <View style={[s.row, { marginBottom: 20 }]}>
        <View style={s.avatar}><Text style={s.avatarText}>{(profile?.driver.name ?? '?').trim().charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.hello}>{profile ? `Hello, ${firstName}` : ' '}</Text>
          <Text style={s.sub}>{truckShort}{profile ? ` · ${profile.company.name}` : ''}</Text>
        </View>
        <Image source={require('../../assets/logo.jpg')} style={s.miniLogo} accessibilityLabel="6.11 Drive GPS" />
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <View style={[s.row, { flex: 1 }]}>
            <View style={[s.statusDot, { backgroundColor: tracking ? colors.green : '#6B7280' }]} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={s.cardTitle}>{tracking ? 'Tracking Active' : 'Tracking Off'}</Text>
              <Text style={s.sub} numberOfLines={1}>{tracking ? syncLine : 'Your company cannot see your truck'}</Text>
            </View>
          </View>
          <TouchableOpacity style={[s.chip, tracking ? s.chipOff : s.chipOn]} onPress={toggleTracking} activeOpacity={0.85}>
            <Text style={[s.chipText, { color: tracking ? colors.text : '#052E16' }]}>{tracking ? 'Stop' : 'Start'}</Text>
          </TouchableOpacity>
        </View>
        {!!modeNote && tracking && <Text style={s.warn}>{modeNote}</Text>}
        {!!shareError && <Text style={s.err}>{shareError}</Text>}
      </View>

      <View style={[s.row, { gap: 12, marginBottom: 12 }]}>
        <View style={[s.card, s.stat]}>
          <Ionicons name="speedometer-outline" size={20} color={colors.green} />
          <Text style={s.statValue}>{mph ?? '–'}<Text style={s.statUnit}> mph</Text></Text>
          <Text style={s.sub}>Speed</Text>
        </View>
        <View style={[s.card, s.stat]}>
          <Ionicons name="navigate-outline" size={20} color={colors.green} />
          <Text style={s.statValue}>{todayMiles.toFixed(0)}<Text style={s.statUnit}> mi</Text></Text>
          <Text style={s.sub}>Today</Text>
        </View>
      </View>

      <TouchableOpacity style={[s.card, { padding: 0, overflow: 'hidden' }]} activeOpacity={0.9} onPress={() => setMapOpen(true)} accessibilityLabel="Open the map">
        <View style={{ height: 190 }}>
          <MapView interactive={false} style={StyleSheet.absoluteFill} onPosition={(p, e) => { setPos(p); setPosError(e ?? ''); }} />
        </View>
        <View style={[s.row, s.mapFooter]}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Your location</Text>
            <Text style={s.sub} numberOfLines={1}>{pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}` : posError || 'Finding your position…'}</Text>
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 13 }}>Open map</Text>
            <Ionicons name="expand-outline" size={16} color={colors.green} />
          </View>
        </View>
      </TouchableOpacity>

      {profile?.activeTrip ? (
        <TouchableOpacity style={[s.cta, { backgroundColor: colors.red }, tripBusy && { opacity: 0.6 }]} onPress={finishTrip} disabled={tripBusy} activeOpacity={0.85}>
          <Text style={[s.ctaText, { color: '#fff' }]}>{tripBusy ? 'Please wait…' : 'End Trip'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[s.cta, (tripBusy || !profile?.truck) && { opacity: 0.5 }]} onPress={beginTrip} disabled={tripBusy || !profile?.truck} activeOpacity={0.85}>
          <Text style={s.ctaText}>{tripBusy ? 'Getting GPS position…' : 'Start Trip'}</Text>
        </TouchableOpacity>
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
            <Text style={[s.cardTitle, { color: colors.green }]}>● In progress</Text>
            <Text style={s.sub}>Started {new Date(profile.activeTrip.startedAt).toLocaleTimeString()}</Text>
          </>
        ) : (
          <Text style={s.cardTitle}>No active trip</Text>
        )}
        {profile?.activeTrip ? (
          <TouchableOpacity style={[s.cta, { backgroundColor: colors.red, marginTop: 14 }, tripBusy && { opacity: 0.6 }]} onPress={finishTrip} disabled={tripBusy}>
            <Text style={[s.ctaText, { color: '#fff' }]}>{tripBusy ? 'Please wait…' : 'End Trip'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.cta, { marginTop: 14 }, (tripBusy || !profile?.truck) && { opacity: 0.5 }]} onPress={beginTrip} disabled={tripBusy || !profile?.truck}>
            <Text style={s.ctaText}>{tripBusy ? 'Getting GPS position…' : 'Start Trip'}</Text>
          </TouchableOpacity>
        )}
        {!!tripError && <Text style={s.err}>{tripError}</Text>}
      </View>

      <Text style={[s.label, { marginLeft: 4, marginTop: 6 }]}>HISTORY</Text>
      {recent.length === 0 ? (
        <View style={s.card}><Text style={s.sub}>No trips yet.</Text></View>
      ) : (
        recent.map((t) => (
          <View key={t.id} style={s.card}>
            <View style={s.row}>
              <Text style={s.cardTitle}>{new Date(t.startedAt).toLocaleDateString()}</Text>
              <Text style={{ color: t.status === 'ACTIVE' ? colors.green : colors.muted, fontWeight: '700', fontSize: 12 }}>{t.status === 'ACTIVE' ? 'LIVE' : 'COMPLETED'}</Text>
            </View>
            <Text style={s.sub}>Truck #{t.truck.truckNumber} · {tripLine(t)}</Text>
          </View>
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

  // ---------- Profile ----------
  const profileTab = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Profile</Text>
      <View style={[s.card, { alignItems: 'center', paddingVertical: 26 }]}>
        <View style={[s.avatar, { width: 76, height: 76, borderRadius: 38 }]}><Text style={[s.avatarText, { fontSize: 32 }]}>{(profile?.driver.name ?? '?').trim().charAt(0).toUpperCase()}</Text></View>
        <Text style={[s.cardTitle, { fontSize: 20, marginTop: 12 }]}>{profile?.driver.name ?? '…'}</Text>
        <Text style={s.sub}>{profile?.company.name ?? ' '}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>ASSIGNED TRUCK</Text>
        <Text style={s.cardTitle}>{truckLabel}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>LOCATION SHARING</Text>
        <Text style={s.cardTitle}>{tracking ? 'On' : 'Off'}</Text>
        <Text style={s.sub}>{syncLine}</Text>
      </View>
      <TouchableOpacity style={s.signOut} onPress={signOut} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={20} color={colors.red} />
        <Text style={{ color: colors.red, fontWeight: '800', fontSize: 15, marginLeft: 8 }}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const tabs: TabItem<Tab>[] = [
    { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { id: 'trips', label: 'Trips', icon: 'git-branch-outline', activeIcon: 'git-branch' },
    { id: 'alerts', label: 'Alerts', icon: 'notifications-outline', activeIcon: 'notifications', badge: needsAttention || undefined },
    { id: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {tab === 'home' ? homeTab : tab === 'trips' ? tripsTab : tab === 'alerts' ? alertsTab : profileTab}
      <TabBar tabs={tabs} value={tab} onChange={setTab} />

      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <MapView ref={bigMap} style={StyleSheet.absoluteFill} onPosition={(p, e) => { setPos(p); setPosError(e ?? ''); }} />
          <View style={s.mapTop}>
            <View style={s.mapPill}><Logo size={26} /></View>
            <TouchableOpacity style={s.roundBtn} onPress={() => setMapOpen(false)} accessibilityLabel="Close map"><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity>
          </View>
          <View style={s.mapSheet}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{truckLabel}</Text>
                <Text style={s.sub}>{pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}${pos.accuracy != null ? ` · ±${Math.round(pos.accuracy)} m` : ''}` : posError || 'Finding your position…'}</Text>
              </View>
              <View style={[s.row, { gap: 6 }]}>
                <View style={[s.statusDot, { backgroundColor: tracking ? colors.green : '#6B7280' }]} />
                <Text style={{ color: tracking ? colors.green : colors.muted, fontWeight: '700', fontSize: 12 }}>{tracking ? 'Sharing' : 'Not sharing'}</Text>
              </View>
            </View>
            <TouchableOpacity style={[s.cta, { marginTop: 14 }, tracking && { backgroundColor: colors.surface2 }]} onPress={toggleTracking} activeOpacity={0.85}>
              <Text style={[s.ctaText, tracking && { color: colors.text }]}>{tracking ? 'Stop sharing' : 'Start sharing location'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  page: { padding: 18, paddingTop: 58, paddingBottom: 130 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 16 },
  hello: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.7, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  miniLogo: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.5)' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#052E16' },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  chip: { height: 36, paddingHorizontal: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  chipOn: { backgroundColor: colors.green },
  chipOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipText: { fontWeight: '800', fontSize: 13 },
  stat: { flex: 1, marginBottom: 0, alignItems: 'flex-start' },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 8 },
  statUnit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  mapFooter: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { height: 56, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { color: '#052E16', fontSize: 17, fontWeight: '800' },
  hint: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 12 },
  warn: { color: colors.amber, fontSize: 13, marginTop: 10 },
  err: { color: '#FCA5A5', fontSize: 13, marginTop: 10 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.45)', backgroundColor: 'rgba(239,68,68,0.1)', marginTop: 8 },
  mapTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 48, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mapPill: { backgroundColor: 'rgba(16,24,20,0.92)', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  roundBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(16,24,20,0.95)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mapSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, borderTopWidth: 1, borderColor: colors.border },
});
