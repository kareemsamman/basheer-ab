
# Fix: Client Not Pre-Selected in Policy Wizard

## Root Cause
In `src/components/layout/BottomToolbar.tsx` line 75, the client profile page detection uses an exact match:
```
location.pathname === "/clients"
```
But the actual URL when viewing a client is `/clients/:clientId` (e.g., `/clients/51143e89-...`), so the check always returns `false`. This means `preselectedClientId` is passed as `undefined` to the wizard.

## Fix

### File: `src/components/layout/BottomToolbar.tsx`
Change line 75 from:
```
const isOnClientProfilePage = location.pathname === "/clients" && !!recentClient;
```
To:
```
const isOnClientProfilePage = (location.pathname === "/clients" || location.pathname.startsWith("/clients/")) && !!recentClient;
```

This single-line change ensures the wizard correctly detects the user is on a client profile page (whether the URL is `/clients` with query params or `/clients/:clientId`) and passes the `recentClient.id` as `preselectedClientId`.
