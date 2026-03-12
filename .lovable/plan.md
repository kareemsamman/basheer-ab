

# Add New User from Admin Panel

## Problem
Currently, users can only be added by signing up themselves via `/login`. The admin has no way to directly create a new admin or worker from `/admin/users`.

## Solution
Add an "إضافة مستخدم" (Add User) button in the header of the AdminUsers page that opens a dialog. The admin enters email, full name, selects a role (admin/worker) and branch, then submits. A new edge function `create-user` will use `supabase.auth.admin.createUser` to create the auth user, set up their profile as `active`, and assign the role.

## Changes

### 1. New Edge Function: `supabase/functions/create-user/index.ts`
- Accepts: `email`, `full_name`, `role` (admin|worker), `branch_id`
- Validates the caller is an admin (check `user_roles` for the authenticated user)
- Creates auth user via `supabase.auth.admin.createUser({ email, email_confirm: true })`
- Updates the auto-created profile: sets `status = 'active'`, `full_name`, `branch_id`
- Inserts into `user_roles` with the chosen role
- Returns success with the new user ID

### 2. Update `src/pages/AdminUsers.tsx`
- Add "إضافة مستخدم" button next to the refresh button in the header
- Add a Dialog with form fields: email (required), full name, role select (admin/worker), branch select
- On submit, invoke the `create-user` edge function
- On success, refresh the users list and show success toast
- Uses existing UI components (Dialog, Input, Select, Button)

No database migrations needed — uses existing `profiles` and `user_roles` tables.

