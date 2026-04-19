# AgriInvest Auth Web

A multi-page frontend for AgriInvest AI onboarding, built with HTML, CSS, and JavaScript.

## Features

- Authentication pages (login and register)
- Firebase Auth integration (email/password, Google sign-in, password reset)
- Firestore profile and onboarding data persistence
- 4-step onboarding flow:
  - Contact details
  - Farm location with Leaflet map
  - Documents metadata
  - Review and submit
- Verification dashboard
- Logout support across onboarding and dashboard pages

## Project Structure

- pages/ : All HTML pages
- css/ : Shared styles
- js/ : Application scripts
- env.example.js : Example runtime config
- env.js : Local runtime config (ignored by git)

## Entry Points

- Root redirect: index.html
- App start page: pages/index.html

## Run Locally

1. Open a terminal in this folder.
2. Start a static server:
   - python -m http.server 5500
3. Open:
   - http://localhost:5500/pages/index.html

## Firebase Configuration

This project reads Firebase config from env.js.

1. Copy env.example.js to env.js:
   - Git Bash: `cp env.example.js env.js`
   - PowerShell: `Copy-Item env.example.js env.js`
2. Replace placeholder values in env.js with your Firebase project values.

Important:
- env.js is ignored by git to reduce accidental leaks.
- Firebase web config is client-side and visible in browser; secure your Firebase project with proper Auth settings, Firestore rules, and allowed domains.

## Git Notes

To commit project files from this folder:

- git add .
- git commit -m "update project"
- git push origin main
