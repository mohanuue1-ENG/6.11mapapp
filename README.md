# 6.11 Drive GPS — driver app

React Native (Expo) + TypeScript. This is a **separate project** from the website and the API
(`../gps website`, `../gps website/server`); it only talks to the API over HTTPS.

## What it does (PRD phase 3)
- Driver sign in (drivers only; admins use the website). Tokens are kept in Keychain/Keystore, the single-use refresh token rotates and survives restarts.
- Shows the driver's own profile and assigned truck (`GET /driver/me`).
- Background location (foreground service on Android, background mode on iOS), independent of trips.
- Every GPS fix is written to a persistent queue first, then uploaded in batches of 100 to `POST /gps/locations/batch`. Points keep their original timestamp and a unique `eventId`, so offline uploads are stored with the right time and are never duplicated.
- The server's answer decides what leaves the queue: accepted, duplicate and rejected points are removed; on a network error everything stays and is retried (on reconnect, on app open, and after each new fix).
- Shows pending count and last successful upload.
- Start / End Trip with a fresh, accurate GPS fix from the phone (never a cached or invented one; a weak fix is refused with a clear message and can be retried). Ending uploads the queued route points first so the distance is complete. Recent trips are listed on the Home screen.

## Not built yet
- Full trip history/detail screens, notifications, theming/dark mode, push tokens (`devices`).
- The queue uses AsyncStorage capped at 5 000 points (oldest dropped). Move it to SQLite if drivers can be offline for days.

## Run it
```bash
npm install
npx expo install --fix      # aligns package versions with the installed Expo SDK
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your computer's LAN address
npx expo prebuild           # background location needs a development build, not Expo Go
npx expo run:android        # or run:ios (macOS)
```
Start the API with `npm run dev` in `../gps website/server`, create a driver with a login and assign a truck
in the website, then sign in on the phone.

## Must be tested on real devices (PRD §14)
Background location behaves differently per phone brand and OS version (battery optimisation, "always allow",
app killed, airplane mode). An emulator cannot show this. Tune `GPS` in `src/config.ts` from what you measure.
