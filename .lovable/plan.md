
# Fix: Dropdown not scrollable in MultiSelectFilter

## Problem
The `ScrollArea` component uses `max-h-[220px]` which doesn't work correctly with Radix ScrollArea. The Radix viewport doesn't inherit `max-height` from the root, so the list grows unbounded and can't scroll.

## Solution
Replace `ScrollArea` with a plain `div` that has `overflow-y: auto` and a fixed `max-height`. This is simpler and works reliably.

## Change

**File:** `src/components/shared/MultiSelectFilter.tsx`

Replace line 118:
```
<ScrollArea className="max-h-[220px]">
```
with:
```
<div className="max-h-[220px] overflow-y-auto">
```

And replace the closing `</ScrollArea>` on line 139 with `</div>`.

Remove the unused `ScrollArea` import from line 8.

This is a 3-line change that makes all MultiSelectFilter dropdowns scrollable across Company Settlement and Tax Invoice pages.
