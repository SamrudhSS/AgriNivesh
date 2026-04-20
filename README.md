# AgriInvest Auth Web

Role-based, multi-page web app for AgriInvest AI with Firebase Auth + Firestore.

This module includes:
- Farmer onboarding and verification lifecycle
- Investor dashboard with farmer profile visibility
- Admin verification queue with approve/reject actions
- Role-based login/register and guarded navigation

## Tech Stack

- Frontend: HTML, CSS, JavaScript (ES modules)
- Auth: Firebase Authentication
- Database: Firestore
- Map: Leaflet + OpenStreetMap (farm location step)

## Current User Roles

- Farmer
- Investor
- Admin

## End-to-End Workflow

### 1. Registration

User selects role on register screen and can sign up using:
- Email + password
- Google sign-up

Post-registration redirect behavior:
- Farmer -> pages/onboarding-contact.html
- Investor -> pages/investor-dashboard.html
- Admin -> pages/admin-dashboard.html

### 2. Login

Login screen has role selection for user intent, but final routing is based on stored profile role in Firestore.

Login methods:
- Email + password
- Google sign-in

### 3. Farmer Onboarding (4 Steps)

1. Contact details
2. Farm location (map + coordinates)
3. Document metadata (identity/land document names)
4. Review and submit

On submit:
- onboarding.status becomes submitted
- verificationStatus becomes pending
- farmerProfile is generated from submitted onboarding data and stored on user record

### 4. Admin Verification

Admin dashboard loads submitted farmer applications.

Admin actions:
- Tick Approve -> verificationStatus set to verified
- Wrong Reject -> verificationStatus set to rejected

Admin decision also updates farmerProfile and onboarding status for consistency.

### 5. Farmer Verification Dashboard

Farmer sees status text:
- Waiting for verification
- Verified by admin
- Rejected by admin

Farmer dashboard reads both onboarding data and farmerProfile snapshot.

### 6. Investor Visibility

Investor dashboard includes Farmer Profiles Directory.

Investor can view all farmer profiles, including:
- Name/farm/location/crop/acreage
- Verification status
- Uploaded document metadata (file names)

## Profile Generation Logic

Farmer profile is built from:
- Basic user info: fullName, email
- Step 1: primaryMobile, communication method
- Step 2: farmName, state, district, crop, acreage, latitude, longitude
- Step 3: identityDocName, landDocName
- Verification status and onboarding state

This profile is:
- created at submission
- refreshed when admin verifies/rejects

## Routing and Guarding Rules

- Shared role router maps role to target page
- Farmer onboarding pages block Investor/Admin access
- Investor/Admin dashboards validate role and redirect if mismatched
- Active session role/uid is cached in localStorage

## Local Storage Strategy

Onboarding drafts are user-scoped by uid to prevent cross-user data leakage.

Key behavior:
- No global shared draft across accounts
- Legacy global draft keys are cleaned during auth flow

## Project Structure

- pages/: HTML pages
  - pages/index.html (login)
  - pages/register.html
  - pages/onboarding-contact.html
  - pages/onboarding-location.html
  - pages/onboarding-documents.html
  - pages/onboarding-review.html
  - pages/verification-dashboard.html
  - pages/investor-dashboard.html
  - pages/admin-dashboard.html
- js/: app logic and Firebase service layer
- css/: shared styles
- env.example.js: template config
- env.js: local runtime config (ignored)
- index.html: root redirect to pages/index.html

## Run Locally (Recommended)

Run from any folder using pinned directory:

1. Start server on 5500
   - C:/Users/samru/AppData/Local/Python/pythoncore-3.14-64/python.exe -m http.server 5500 --directory "C:/Users/samru/Documents/gdg goa/stitch_agriinvest_ai/agriinvest_auth_web"
2. Open app root
   - http://localhost:5500/

The root index redirects automatically to pages/index.html.

## Firebase Setup

1. Copy env.example.js to env.js
   - Git Bash: cp env.example.js env.js
   - PowerShell: Copy-Item env.example.js env.js
2. Fill Firebase values in env.js
3. Ensure Firebase Auth providers are enabled
   - Email/Password
   - Google
4. Add localhost domain in Firebase Auth authorized domains

Important:
- Do not commit env.js or secrets files.
- Firebase web config is public by design; secure Firestore using role-aware rules.

## Firestore Data Shape (High-Level)

Collection:
- users/{uid}

Main fields:
- role
- fullName, email, phone, countryCode
- verificationStatus
- onboarding
  - step1ContactInfo
  - step2FarmLocation
  - step3Documents
  - step4Review
  - status, submittedAt, reviewedAt, reviewedBy
- farmerProfile

## Security Rules Guidance

For production, enforce role-based reads/writes:
- Farmer: read/write own profile/onboarding only
- Admin: read submitted farmers and write verification decisions
- Investor: read restricted farmerProfile fields only

If investor profile listing fails, first verify Firestore rules permit investor reads to farmer profile data.

## Testing Checklist

1. Register as Farmer -> reaches onboarding contact page
2. Complete onboarding and submit -> status pending
3. Register/Login as Admin -> open admin dashboard and approve/reject a farmer
4. Login as Farmer -> verify dashboard status reflects admin decision
5. Login as Investor -> verify farmer directory renders all profiles

## Git Workflow (Safe)

Typical flow:

1. git status
2. git add <intended-files>
3. git commit -m "your message"
4. git pull --rebase origin main
5. git push origin main

Before pushing, verify sensitive files are not staged, for example:
- google-services.json
- zip artifacts
- local env files
