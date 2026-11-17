import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleProp, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Colors, useTheme } from './theme';

// OpenStreetMap, satellite (Esri) and topographic data drawn with Leaflet, the same library as the company
// website. None of these need a key. The page tells the app when it is really ready, so a position is never
// sent into a map that has not loaded yet.
const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>:root{--a:#22C55E;--a2:rgba(34,197,94,.3)}html,body,#m{height:100%;margin:0;background:#0F1512}
.leaflet-control-zoom{display:none}
.dark-tiles{filter:invert(1) hue-rotate(180deg) brightness(.9) contrast(.95) saturate(.7)}
.me{position:relative;width:22px;height:22px}
.me i{position:absolute;inset:0;border-radius:50%;background:var(--a);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.6)}
.me b{position:absolute;inset:-10px;border-radius:50%;background:var(--a2);animation:p 2s ease-out infinite}
@keyframes p{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.4);opacity:0}}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="window.ReactNativeWebView.postMessage('error')"></script>
<script>
(function(){
  if(!window.L){window.ReactNativeWebView.postMessage('error');return}
  var post=function(t){window.ReactNativeWebView.postMessage(t)};
  var accent='#22C55E';
  var line=null,casing=null,startMark=null,endMark=null;
  var map=L.map('m',{zoomControl:false,attributionControl:false}).setView([20,0],2);
  var OSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var styles={
    standard:L.tileLayer(OSM,{maxZoom:19}),
    dark:L.tileLayer(OSM,{maxZoom:19,className:'dark-tiles'}),
    satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
    terrain:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,subdomains:'abc'})
  };
  var current=null;
  window.setStyle=function(name){
    if(!styles[name])name='standard';
    if(current)map.removeLayer(current);
    current=styles[name].addTo(map);
  };
  window.setStyle('standard');

  var marker=null,circle=null,follow=true,last=null,zoom=17;
  var setFollow=function(v){follow=v;post(v?'follow:1':'follow:0')};
  map.on('dragstart',function(){setFollow(false)});
  map.on('zoomend',function(){if(follow)zoom=map.getZoom()});

  // While following, the truck stays in the middle of the screen as it moves.
  window.setPos=function(lat,lng,acc){
    last=[lat,lng];var p=last;
    if(!marker){
      marker=L.marker(p,{icon:L.divIcon({className:'',html:'<div class="me"><b></b><i></i></div>',iconSize:[22,22],iconAnchor:[11,11]}),zIndexOffset:1000}).addTo(map);
      circle=L.circle(p,{radius:acc||20,color:accent,weight:1,fillOpacity:.1}).addTo(map);
      map.setView(p,zoom,{animate:false});
    }else{
      marker.setLatLng(p);circle.setLatLng(p);circle.setRadius(acc||20);
      if(follow)map.setView(p,map.getZoom(),{animate:true,duration:.6});
    }
  };
  window.recenter=function(){
    setFollow(true);
    if(last){zoom=Math.max(map.getZoom(),17);map.setView(last,zoom,{animate:true})}
  };
  window.fit=function(){map.invalidateSize();if(last&&follow)map.setView(last,map.getZoom())};
  // The trip's route: a line with a white edge, and a dot where the trip started. An empty list removes both.
  window.setRoute=function(pts,fit){
    if(!pts||!pts.length){if(line){map.removeLayer(line);map.removeLayer(casing);line=null;casing=null}if(startMark){map.removeLayer(startMark);startMark=null}if(endMark){map.removeLayer(endMark);endMark=null}return}
    if(!line){casing=L.polyline(pts,{color:'#fff',weight:10,opacity:.9,lineJoin:'round',lineCap:'round'}).addTo(map);line=L.polyline(pts,{color:accent,weight:6,opacity:1,lineJoin:'round',lineCap:'round'}).addTo(map)}else{casing.setLatLngs(pts);line.setLatLngs(pts)}
    if(!startMark){startMark=L.circleMarker(pts[0],{radius:8,color:'#fff',weight:3,fillColor:accent,fillOpacity:1}).addTo(map)}else{startMark.setLatLng(pts[0])}
    if(fit){if(!endMark){endMark=L.circleMarker(pts[pts.length-1],{radius:8,color:'#fff',weight:3,fillColor:'#EF4444',fillOpacity:1}).addTo(map)}else{endMark.setLatLng(pts[pts.length-1])}if(pts.length>1){map.fitBounds(line.getBounds(),{padding:[60,60],maxZoom:17})}else{map.setView(pts[0],16)}}
  };
  window.setTheme=function(a,a2,bg){accent=a;if(line)line.setStyle({color:a});if(startMark)startMark.setStyle({fillColor:a});var r=document.documentElement.style;r.setProperty('--a',a);r.setProperty('--a2',a2);document.body.style.background=bg;document.getElementById('m').style.background=bg;if(circle)circle.setStyle({color:a})};
  post('ready');
})();
</script></body></html>`;

export type MapPosition = { latitude: number; longitude: number; accuracy: number | null; speedMps: number | null };
export type MapHandle = { recenter: () => void; refit: () => void };

const STYLES: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'standard', label: 'Standard', icon: 'map-outline' },
  { id: 'dark', label: 'Dark', icon: 'moon-outline' },
  { id: 'satellite', label: 'Satellite', icon: 'globe-outline' },
  { id: 'terrain', label: 'Terrain', icon: 'triangle-outline' },
];

let rememberedStyle: string | null = null;

const toPos = (loc: Location.LocationObject): MapPosition => {
  const sp = loc.coords.speed;
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy, speedMps: typeof sp === 'number' && sp >= 0 ? sp : null };
};

// Live map of where the phone is. It reads the position itself, so it works whether or not
// location sharing is on; nothing is uploaded from here.
const MapView = forwardRef<MapHandle, { style?: StyleProp<ViewStyle>; interactive?: boolean; onPosition?: (p: MapPosition | null, error?: string) => void; route?: [number, number][]; fitRoute?: boolean }>(
  function MapView({ style, interactive = true, onPosition, route, fitRoute = false }, ref) {
    const { colors, mode } = useTheme();
    const a2 = colors.isDark ? 'rgba(34,197,94,.3)' : 'rgba(10,132,245,.3)';
    const web = useRef<WebView>(null);
    const [pos, setPos] = useState<MapPosition | null>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [gpsNote, setGpsNote] = useState('');
    const [following, setFollowing] = useState(true);
    const [mapStyle, setMapStyle] = useState(rememberedStyle ?? (mode === 'day' ? 'standard' : 'dark'));
    const [picker, setPicker] = useState(false);

    const recenter = () => {
      setFollowing(true);
      web.current?.injectJavaScript('window.recenter&&window.recenter();true;');
    };
    useImperativeHandle(ref, () => ({
      recenter,
      refit: () => web.current?.injectJavaScript('window.fit&&window.fit();true;'),
    }));

    // Read the phone position: a quick first fix, then continuous updates.
    useEffect(() => {
      // A saved route (trip history) is only looked at: the phone's own position is not read or shown.
      if (fitRoute) return undefined;
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      const publish = (loc: Location.LocationObject) => {
        const p = toPos(loc);
        setPos(p);
        setGpsNote('');
        onPosition?.(p);
      };
      const fail = (msg: string) => {
        setGpsNote(msg);
        onPosition?.(null, msg);
      };
      (async () => {
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== 'granted') return fail('Allow location access to see your position.');
          if (perm.android?.accuracy === 'coarse') setGpsNote('Choose “Precise” location for this app in the phone settings.');
          if (!(await Location.hasServicesEnabledAsync())) return fail('Turn on Location (GPS) in the phone’s quick settings.');

          const last = await Location.getLastKnownPositionAsync().catch(() => null);
          if (last && !cancelled) publish(last);
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
            .then((loc) => !cancelled && publish(loc))
            .catch(() => !cancelled && setGpsNote((n) => n || 'Waiting for a GPS signal. Go near a window or outside.'));

          const s = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 }, (loc) => !cancelled && publish(loc));
          if (cancelled) s.remove();
          else sub = s;
        } catch {
          fail('Could not read your position. Turn on GPS.');
        }
      })();
      return () => {
        cancelled = true;
        sub?.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Send the position once the map is ready, and again every few seconds so the marker is never lost.
    useEffect(() => {
      if (!pos || !ready) return undefined;
      const send = () => web.current?.injectJavaScript(`window.setPos&&window.setPos(${pos.latitude},${pos.longitude},${pos.accuracy ?? 20});true;`);
      send();
      const t = setInterval(send, 4000);
      return () => clearInterval(t);
    }, [pos, ready]);

    // The route line follows the driver while a trip runs. A long trip is thinned out so the map stays smooth.
    useEffect(() => {
      if (!ready) return;
      let pts = route ?? [];
      if (pts.length > 1500) {
        const step = Math.ceil(pts.length / 1500);
        pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
      }
      web.current?.injectJavaScript(`window.setRoute&&window.setRoute(${JSON.stringify(pts)},${fitRoute ? 'true' : 'false'});true;`);
    }, [ready, route, fitRoute]);

    useEffect(() => {
      if (ready) web.current?.injectJavaScript(`window.setStyle&&window.setStyle(${JSON.stringify(mapStyle)});true;`);
    }, [ready, mapStyle]);

    useEffect(() => {
      if (ready) web.current?.injectJavaScript(`window.setTheme&&window.setTheme(${JSON.stringify(colors.accent)},${JSON.stringify(a2)},${JSON.stringify(colors.mapBg)});true;`);
    }, [ready, colors, a2]);

    // Switching day/night also switches the map between the light and dark street map (satellite and terrain stay).
    const firstMode = useRef(true);
    useEffect(() => {
      if (firstMode.current) {
        firstMode.current = false;
        return;
      }
      setMapStyle((cur) => (cur === 'satellite' || cur === 'terrain' ? cur : mode === 'day' ? 'standard' : 'dark'));
    }, [mode]);

    // If the map page does not report ready, the phone probably has no internet.
    useEffect(() => {
      if (ready) return undefined;
      const t = setTimeout(() => setFailed(true), 12000);
      return () => clearTimeout(t);
    }, [ready]);

    return (
      <View style={[{ backgroundColor: colors.mapBg }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
        <WebView
          ref={web}
          style={{ flex: 1, backgroundColor: colors.mapBg }}
          originWhitelist={['*']}
          source={{ html: HTML, baseUrl: 'https://localhost/' }}
          onMessage={(e) => {
            const m = e.nativeEvent.data;
            if (m === 'ready') {
              setReady(true);
              setFailed(false);
            } else if (m === 'error') setFailed(true);
            else if (m === 'follow:1') setFollowing(true);
            else if (m === 'follow:0') setFollowing(false);
          }}
          onError={() => setFailed(true)}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          scrollEnabled={interactive}
        />

        {interactive && (
          <View style={{ position: 'absolute', right: 14, top: 110, alignItems: 'flex-end' }}>
            <TouchableOpacity style={btn(colors, picker)} onPress={() => setPicker(!picker)} accessibilityLabel="Map type" activeOpacity={0.85}>
              <Ionicons name="layers-outline" size={22} color={picker ? colors.onAccent : colors.text} />
            </TouchableOpacity>
            {picker && (
              <View style={{ marginTop: 8, backgroundColor: colors.overlay, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 6 }}>
                {STYLES.map((st) => {
                  const on = st.id === mapStyle;
                  return (
                    <TouchableOpacity
                      key={st.id}
                      onPress={() => {
                        rememberedStyle = st.id;
                        setMapStyle(st.id);
                        setPicker(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 42, borderRadius: 12, backgroundColor: on ? colors.accent : 'transparent' }}
                    >
                      <Ionicons name={st.icon} size={18} color={on ? colors.onAccent : colors.muted} />
                      <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: '700', fontSize: 14 }}>{st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TouchableOpacity style={[btn(colors, following), { marginTop: 10 }, fitRoute && { display: 'none' }]} onPress={recenter} accessibilityLabel="My location" activeOpacity={0.85}>
              <Ionicons name={following ? 'navigate' : 'navigate-outline'} size={22} color={following ? colors.onAccent : colors.accent} />
            </TouchableOpacity>
          </View>
        )}

        {(failed && !ready) || (ready && !pos && !!gpsNote) ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: '40%', alignItems: 'center' }}>
            <Text style={{ color: colors.text, textAlign: 'center', backgroundColor: colors.overlay, padding: 12, borderRadius: 12, overflow: 'hidden' }}>
              {failed && !ready ? 'The map could not load. Check the phone’s internet connection.' : gpsNote}
            </Text>
          </View>
        ) : null}
      </View>
    );
  },
);

const btn = (colors: Colors, active: boolean) => ({
  width: 46,
  height: 46,
  borderRadius: 23,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: active ? colors.accent : colors.overlay,
  borderWidth: 1,
  borderColor: active ? colors.accent : colors.border,
});

export default MapView;
