
# Fix: Car step showing previous client's cars when creating a new client

## Problem
When the policy wizard is opened from a client profile (preselectedClientId), the client's cars are fetched and one may be auto-selected. If the user then clicks "Create New Client" in Step 1, `selectedClient` is set to `null`, but:
- `clientCars` array still holds the old client's cars
- `selectedCar` still holds the previously selected car

Step2Car's `useEffect` only runs `fetchClientCars` when `selectedClient?.id` is truthy -- it never clears `clientCars` when the client changes to null.

## Solution

### File: `src/components/policies/wizard/Step2Car.tsx`
Modify the `useEffect` (line 63-68) to clear car data when `selectedClient` is null:

```text
// Before:
useEffect(() => {
  if (selectedClient?.id) {
    fetchClientCars(selectedClient.id);
  }
}, [selectedClient?.id]);

// After:
useEffect(() => {
  if (selectedClient?.id) {
    fetchClientCars(selectedClient.id);
  } else {
    // Clear cars when no client is selected (e.g. creating new client)
    setClientCars([]);
    setSelectedCar(null);
    setExistingCar(null);
  }
}, [selectedClient?.id]);
```

This ensures that when the user switches to "create new client" mode (which sets `selectedClient` to null), the car list and selected car are cleared, so Step 2 correctly shows an empty car list with the option to add a new car.

### No other files need changes
The root cause is entirely in Step2Car's effect not handling the null case.
