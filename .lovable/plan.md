

# Remove Notifications from Sidebar and Bottom Toolbar

## Changes

### 1. `src/components/layout/Sidebar.tsx`
- Remove the "التنبيهات" nav item (line 82) from the sidebar menu items array
- Clean up unused `SidebarNotificationBadge` import (line 43) and `Bell` icon import (line 11)
- Remove the `notifications` case from `renderBadge` (line 228)

### 2. `src/components/layout/BottomToolbar.tsx`
- Remove `NotificationsDropdown` import (line 5) and its usage (lines 170-173: the separator + `<NotificationsDropdown />`)

