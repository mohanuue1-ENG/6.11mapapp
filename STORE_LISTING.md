# TRUKOVA — store listing (Google Play and App Store)

Copy these into the Play Console and App Store Connect. Replace anything in [brackets].

- App name: **TRUKOVA** (30 characters max)
- Package / bundle id: `com.drive611.gps`
- Privacy policy URL: `https://611truckos.com/privacy`
- Support URL: `https://611truckos.com/contact`
- Category: Business (Play: Maps & Navigation or Business)
- Contact email shown in the store: [your support email]

---

## Google Play

**Short description (80 max)**
`Share your truck's location and trips with your company. Drivers only.`

**Full description (4000 max)**
```
TRUKOVA is the driver app for trucking companies that track their fleet.

Your company adds your phone number. You open the app, create your account with your phone number, name and Gmail, confirm the code we email you, and choose a password. After that, sign-in takes a few taps.

What you can do
• Share your truck's location with your company while you drive
• Start and end trips, and see your recent trips
• See your assigned truck and your trip route on the map
• Keep working with a weak signal: locations are saved on the phone and sent when the connection returns
• Switch between night and day mode

Your privacy
• Location is shared only while you have sharing on, and you can stop at any time
• Only your own company's administrators can see your location
• We do not sell personal information and we show no ads

TRUKOVA is for drivers whose company uses the TRUKOVA fleet service. You need your company to add your phone number before you can create an account.
```

**Background location declaration (Play Console → App content → Sensitive permissions)**
- Core feature: sharing the truck's live position and recording trips for the driver's trucking company.
- Why background: a trip lasts hours with the phone locked or another app (navigation) in front. If location stopped when the screen turned off, the company could not follow the truck and the trip route would have gaps.
- The driver starts and stops sharing; a persistent notification is shown while location is used.
- Video to record (30–60 s): open the app → sign in → tap Start → show the “Always allow” prompt and the in-app explanation → lock the screen → open the website live map and show the truck still moving → stop sharing.

**Data safety form (answers)**
| Data | Collected | Shared | Purpose |
|---|---|---|---|
| Approximate and precise location | Yes | No (only the driver's own company sees it) | App functionality |
| Name, email address, phone number | Yes | No | Account management |
| User IDs / device info (IP, sign-in times) | Yes | No | Security |
| Data encrypted in transit | Yes | | |
| Users can ask for deletion | Yes (through the company or support) | | |
| Ads | None | | |

---

## App Store

- **Subtitle (30 max):** `Fleet GPS for drivers`
- **Promotional text (170 max):** `Share your truck's location and trips with your company. Create your account with your phone number.`
- **Keywords (100 max):** `trucking,fleet,gps,driver,tracking,logistics,trip,truck,dispatch`
- **Description:** use the Google Play full description above.
- **Copyright:** [year] [your company name]

**Background location (App Review notes)**
```
TRUKOVA lets a truck driver share the phone's location with the trucking company that employs them. Trips run for hours with the screen locked, so the app uses "Always" location with the location background mode. The driver starts and stops sharing in the app. Location is visible only to administrators of the driver's own company.
```

**Review notes — how to sign in (Apple and Google reviewers need this)**
Drivers create their account with a phone number their company already added, then confirm an emailed code. Prepare before submitting:
1. In the website, as a company admin, add a driver with phone `[test phone, e.g. +1 555 0100]` and assign a truck.
2. Give the reviewer: that phone number, a Gmail/inbox they can read (or a mailbox you check and forward the code from), and the website admin login so they can see the map.
3. Write it in “Notes for review”:
```
Sign-up: tap Create account → enter phone [number] → name → email [reviewer inbox] → enter the 6-digit code emailed to that address → choose a password. Admin website for the live map: https://611truckos.com (login: [admin email] / [admin password]).
```
(Use a throwaway admin account for this, not your real one.)

**App Privacy (nutrition labels)**
Data linked to the user: Precise Location, Name, Email Address, Phone Number, User ID, Device ID/IP. Used for: App Functionality and Security. Used for tracking: No.

---

## Screenshots to prepare
Take them from the real app (night mode looks best; day mode for variety):

| # | Screen | Caption idea |
|---|---|---|
| 1 | Sign-in (phone with country picker) | Create your account with your phone number |
| 2 | Home with map and tracking active | Share your truck's location |
| 3 | Trip in progress with route line | Follow your trip on the map |
| 4 | Trips list | See your recent trips |
| 5 | Profile sheet | Your driver and truck details |
| 6 | Day mode | Night and day mode |

Sizes
- Play: 2–8 phone screenshots, PNG/JPG, 16:9 or 9:16, 320–3840 px per side. Feature graphic 1024×500. Icon 512×512.
- App Store: iPhone 6.9" (1320×2868 or 1290×2796). Icon 1024×1024 without transparency.

## Before the first submission
- Play needs an **AAB**: `npx eas-cli build -p android --profile production` (set `"buildType": "app-bundle"` for the production profile).
- New personal Play accounts must run a closed test with 12 testers for 14 days before production.
- Apple requires in-app account deletion for apps that let people create accounts (not yet in the app).
- Add a real support email to the website Contact page.

---

## Somali (qoraal gaaban)
**Sharaxaad gaaban:** La wadaag goobta gaadhigaaga iyo safarradaada shirkaddaada. Darawalada oo keliya.

**Sharaxaad:** TRUKOVA waa abka darawalada shirkadaha gaadiidka. Shirkaddaadu waxay ku dartaa lambarkaaga. Fur abka, ku samee akoonka lambarkaaga, magacaaga iyo Gmail-kaaga, xaqiiji code-ka laguu soo diray, dooro password. Goobtaada waxaa la wadaagaa marka aad shidto oo keliya, waxaana arki kara maamulayaasha shirkaddaada oo keliya. Xogta lama iibiyo, xayeysiis ma jiro.
