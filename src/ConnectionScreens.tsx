import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';

// The three connection screens, drawn as small animated SVG scenes in a WebView
// (react-native-webview is already part of the app, so no new native module is needed).
//   1. OfflineIntro   - the app was opened with no connection (full screen).
//   2. ConnectionCard - 'offline': the connection dropped while the app is open.
//   3. ConnectionCard - 'online': the connection came back.

const LOGO_PATH =
  'M60 504 L64 520 L78 541 L97 556 L120 567 L140 573 L174 578 L205 579 L254 575 L341 557 L391 541 L433 524 L481 501 L523 477 L561 451 L580 434 L541 458 L492 482 L434 504 L394 516 L317 530 L285 532 L237 530 L200 523 L170 512 L150 499 L133 479 L127 463 L129 434 L139 412 L162 385 L160 384 L117 406 L85 435 L65 468 L60 487Z M282 336 L50 355 L56 357 L272 369Z M303 274 L57 292 L30 296 L292 309Z M295 211 L68 234 L281 245Z M497 106 L398 136 L390 146 L378 179 L371 191 L328 192 L318 200 L315 206 L315 210 L295 251 L346 252 L347 255 L302 369 L296 394 L295 421 L299 439 L306 452 L314 461 L330 471 L365 479 L409 476 L456 463 L467 456 L473 447 L493 389 L456 402 L425 404 L414 400 L407 394 L403 386 L402 371 L409 344 L443 254 L445 252 L527 252 L531 250 L541 238 L559 193 L467 190Z M713 101 L707 82 L693 59 L677 43 L661 32 L630 18 L597 10 L560 6 L519 7 L480 12 L428 24 L380 40 L300 78 L251 109 L210 140 L188 159 L146 203 L154 194 L156 195 L192 165 L245 129 L303 100 L359 79 L414 65 L465 60 L520 63 L561 73 L590 86 L620 108 L640 137 L646 154 L648 190 L638 228 L620 265 L595 301 L546 353 L582 330 L625 293 L651 265 L676 232 L693 203 L709 162 L715 127Z';

const PAGE = (body: string, bg: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;height:100%;background:${bg};overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>${body}</body></html>`;

const SIDE_TRUCK = `<g id="side">
<rect x="-44" y="-36" width="42" height="28" rx="2" fill="#dfe7e2"/><rect x="-44" y="-24" width="42" height="6" fill="#22c55e"/>
<rect x="-2" y="-12" width="6" height="4" fill="#1a2420"/>
<path d="M4 -8 L4 -30 C4 -33 6 -34 9 -34 L20 -34 L28 -22 L30 -22 L30 -8 Z" fill="#22c55e"/>
<path d="M10 -31 L19 -31 L25 -23 L10 -23 Z" fill="#0b1210" stroke="#9fb3aa" stroke-width="0.8"/>
<rect x="28" y="-16" width="3" height="4" rx="1" fill="#fff3c4"/><rect x="6" y="-44" width="3" height="12" fill="#5d6b66"/>
<rect x="-44" y="-8" width="74" height="3" fill="#1a2420"/>
<circle cx="-36" cy="-4" r="5" fill="#0b1210" stroke="#cfd8d3" stroke-width="1.5"/><circle cx="-24" cy="-4" r="5" fill="#0b1210" stroke="#cfd8d3" stroke-width="1.5"/><circle cx="18" cy="-4" r="5" fill="#0b1210" stroke="#cfd8d3" stroke-width="1.5"/>
</g>`;

const REAR_TRUCK = `<g id="rear">
<rect x="-21" y="-46" width="42" height="40" rx="2" fill="#dfe7e2"/><rect x="-21" y="-32" width="42" height="7" fill="#22c55e"/><line x1="0" y1="-46" x2="0" y2="-8" stroke="#aab7b0" stroke-width="1"/>
<rect x="-21" y="-12" width="42" height="5" fill="#1a2420"/><rect x="-19" y="-18" width="6" height="5" rx="1" fill="#ef4444"/><rect x="13" y="-18" width="6" height="5" rx="1" fill="#ef4444"/>
<rect x="-17" y="-8" width="10" height="8" rx="1.5" fill="#0b1210"/><rect x="7" y="-8" width="10" height="8" rx="1.5" fill="#0b1210"/>
</g>`;

const FRONT_TRUCK = `<g id="front">
<rect x="-20" y="-50" width="40" height="8" rx="1" fill="#dfe7e2"/><rect x="-19" y="-44" width="38" height="8" rx="3" fill="#16a34a"/><rect x="-18" y="-38" width="36" height="32" rx="5" fill="#22c55e"/>
<rect x="-14" y="-35" width="28" height="12" rx="2.5" fill="#0b1210" stroke="#9fb3aa" stroke-width="1"/><rect x="-11" y="-20" width="22" height="10" rx="2" fill="#14261f"/>
<line x1="-9" y1="-17" x2="9" y2="-17" stroke="#cfd8d3" stroke-width="1"/><line x1="-9" y1="-14" x2="9" y2="-14" stroke="#cfd8d3" stroke-width="1"/>
<rect x="-18" y="-18" width="6" height="6" rx="1.5" fill="#fff3c4"/><rect x="12" y="-18" width="6" height="6" rx="1.5" fill="#fff3c4"/>
<rect x="-22" y="-34" width="4" height="10" rx="1.5" fill="#14261f"/><rect x="18" y="-34" width="4" height="10" rx="1.5" fill="#14261f"/>
<rect x="-20" y="-8" width="40" height="5" rx="1.5" fill="#cfd8d3"/><rect x="-21" y="-7" width="7" height="8" rx="1.5" fill="#0b1210"/><rect x="14" y="-7" width="7" height="8" rx="1.5" fill="#0b1210"/>
</g>`;

// Page 1: logo, name, a truck drawing a green line along a curved road.
const INTRO_HTML = PAGE(
  `<svg viewBox="0 0 200 390" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs><path id="logo" d="${LOGO_PATH}" fill="#0583f8" fill-rule="evenodd"/>${SIDE_TRUCK}</defs>
<rect width="200" height="390" fill="#0b1210"/>
<rect x="54" y="26" width="92" height="92" rx="21" fill="#fff"/>
<g transform="translate(62 36) scale(0.108)"><use href="#logo" xlink:href="#logo"/></g>
<text x="100" y="146" text-anchor="middle" fill="#fff" font-size="17" font-weight="500" letter-spacing="3" font-family="sans-serif">TRUKOVA</text>
<path id="rd" d="M-10 330 C 35 330, 45 280, 100 280 S 165 225, 210 225" fill="none" stroke="#1c2a25" stroke-width="24" stroke-linecap="round"/>
<path d="M-10 330 C 35 330, 45 280, 100 280 S 165 225, 210 225" fill="none" stroke="#2f4139" stroke-width="2" stroke-dasharray="8 8"/>
<path d="M-10 330 C 35 330, 45 280, 100 280 S 165 225, 210 225" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur="3.5s" repeatCount="indefinite"/></path>
<g><use href="#side" xlink:href="#side" transform="translate(8 7) scale(0.5)"/><animateMotion dur="3.5s" repeatCount="indefinite" rotate="auto"><mpath href="#rd" xlink:href="#rd"/></animateMotion></g>
<text x="100" y="364" text-anchor="middle" fill="#f59e0b" font-size="13" font-weight="500" font-family="sans-serif">You are offline</text>
</svg>`,
  '#0b1210',
);

const SCENE = `<rect width="200" height="150" fill="#12201a"/>
<ellipse cx="22" cy="52" rx="48" ry="34" fill="#1f3d2c"/><ellipse cx="60" cy="40" rx="40" ry="26" fill="#2a5238"/><ellipse cx="170" cy="30" rx="44" ry="24" fill="#244632"/>
<polygon points="136,60 200,34 200,96 126,80" fill="#5d6b66"/><polygon points="136,60 200,34 200,40 138,66" fill="#76857f"/>
<rect x="0" y="78" width="200" height="72" fill="#1f3d2c"/>
<path d="M60 80 L60 60 C60 36 80 26 100 26 C120 26 140 36 140 60 L140 80 Z" fill="#cdc4a3" stroke="#a79e7f" stroke-width="2"/>
<path d="M69 80 L69 60 C69 42 83 34 100 34 C117 34 131 42 131 60 L131 80 Z" fill="#070c0a"/>
<circle cx="116" cy="40" r="1.8" fill="#f59e0b"/><circle cx="112" cy="43.5" r="1.6" fill="#f59e0b"/><circle cx="109" cy="47" r="1.4" fill="#f59e0b"/><circle cx="106.5" cy="50" r="1.2" fill="#f59e0b"/><circle cx="104.5" cy="53" r="1" fill="#f59e0b"/>
<polygon points="-30,150 230,150 128,80 72,80" fill="#2a3531"/>
<polyline points="-6,150 74,80" stroke="#e7d56a" stroke-width="3" fill="none"/>
<polyline points="206,150 126,80" stroke="#e8efe9" stroke-width="2" fill="none"/>`;

// Page 2: the truck drives away into the dark tunnel and the green line stops at its mouth.
const OFFLINE_CARD_HTML = PAGE(
  `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>${REAR_TRUCK}<clipPath id="c"><rect x="80" y="150" width="40" height="0"><animate attributeName="y" values="150;80;80" keyTimes="0;0.7;1" dur="5s" repeatCount="indefinite"/><animate attributeName="height" values="0;70;70" keyTimes="0;0.7;1" dur="5s" repeatCount="indefinite"/></rect></clipPath></defs>
${SCENE}
<g clip-path="url(#c)"><polygon points="96,150 104,150 100.8,80 99.2,80" fill="#22c55e"/></g>
<g><animateTransform attributeName="transform" type="translate" values="100 146;100 82;100 82" keyTimes="0;0.7;1" dur="5s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" additive="sum" values="0.8;0.2;0.2" keyTimes="0;0.7;1" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.55;0.78;1" dur="5s" repeatCount="indefinite"/><use href="#rear" xlink:href="#rear"/></g>
</svg>`,
  '#12201a',
);

// Page 3: the truck comes out of the tunnel and the green line grows behind it.
const ONLINE_CARD_HTML = PAGE(
  `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>${FRONT_TRUCK}<clipPath id="c"><rect x="80" y="80" width="40" height="0"><animate attributeName="height" values="0;66;66" keyTimes="0;0.75;1" dur="5s" repeatCount="indefinite"/></rect></clipPath></defs>
${SCENE}
<g clip-path="url(#c)"><polygon points="97,150 103,150 100.8,80 99.2,80" fill="#22c55e"/></g>
<g><animateTransform attributeName="transform" type="translate" values="100 82;100 146;100 146" keyTimes="0;0.75;1" dur="5s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" additive="sum" values="0.2;0.8;0.8" keyTimes="0;0.75;1" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1" keyTimes="0;0.15;1" dur="5s" repeatCount="indefinite"/><use href="#front" xlink:href="#front"/></g>
</svg>`,
  '#12201a',
);

const INTRO_MS = 10000;
const CARD_MS = 4500;

function useDone(ms: number, onDone: () => void) {
  const ref = useRef(onDone);
  ref.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => ref.current(), ms);
    return () => clearTimeout(t);
  }, [ms]);
}

// 1. The app was opened with no connection. Tap to skip.
export function OfflineIntro({ onDone }: { onDone: () => void }) {
  useDone(INTRO_MS, onDone);
  return (
    <Pressable style={styles.full} onPress={onDone} accessibilityRole="button" accessibilityLabel="You are offline. Tap to continue.">
      <WebView source={{ html: INTRO_HTML }} originWhitelist={['*']} scrollEnabled={false} pointerEvents="none" style={styles.web} containerStyle={styles.web} androidLayerType="hardware" />
    </Pressable>
  );
}

// 2 and 3. A small card in the middle of the open app.
export function ConnectionCard({ kind, onDone }: { kind: 'offline' | 'online'; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 56, 320);
  const html = useMemo(() => (kind === 'offline' ? OFFLINE_CARD_HTML : ONLINE_CARD_HTML), [kind]);
  useDone(CARD_MS, onDone);
  const offline = kind === 'offline';
  return (
    <Modal transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onDone} accessibilityRole="button" accessibilityLabel={offline ? 'You are offline' : 'Back online'}>
        <View style={[styles.card, { width: w }]}>
          <View style={{ width: w, height: (w * 150) / 200, backgroundColor: '#12201a' }}>
            <WebView source={{ html }} originWhitelist={['*']} scrollEnabled={false} pointerEvents="none" style={styles.web} containerStyle={styles.web} androidLayerType="hardware" />
          </View>
          <Text style={[styles.title, { color: offline ? '#f59e0b' : '#22c55e' }]}>{offline ? 'You are offline' : 'Back online'}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b1210', zIndex: 50 },
  web: { flex: 1, backgroundColor: 'transparent' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#101b17', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: '#2f4139', overflow: 'hidden' },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', paddingVertical: 14 },
});
