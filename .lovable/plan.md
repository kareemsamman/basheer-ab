
# Implementation Plan: Multiple Children / Additional Drivers per Customer

## Overview
Transform the current single additional driver (under24_driver) field into a multi-child/driver system with proper relational tables, reusable selection in Policy Wizard, and display in Invoices/PDF/SMS.

---

## Phase 1: Database Schema Changes ✅ COMPLETE

### A) New Table: `client_children` ✅
### B) New Table: `policy_children` ✅
### C) RLS Policies ✅
### D) Migration of Existing Data ✅

---

## Phase 2: UI Components ✅ COMPLETE

### A) New Component: `ClientChildrenManager.tsx` ✅
### B) Update `ClientDrawer.tsx` ✅
### C) Update `CreateClientForm.tsx` (Policy Wizard) - Legacy fields kept for now

---

## Phase 3: Policy Wizard Integration ✅ COMPLETE

### A) Update Wizard State (`usePolicyWizardState.ts`) ✅
- Added `clientChildren`, `selectedChildIds`, `newChildren` state
- Added `resetChildren` function

### B) New Component: `PolicyChildrenSelector.tsx` ✅

### C) Save Logic Updates ✅
- Children saved on policy creation

---

## Phase 4: Invoice & PDF Updates 🔄 PENDING

### A) Update `generate-invoices` Edge Function
### B) Update Invoice Template Placeholders
### C) Update SMS Templates

---

## Phase 5: Types & Exports ✅ COMPLETE

### A) New Types - `src/types/clientChildren.ts` ✅

---

## Files Created/Modified

### New Files ✅
1. `supabase/migrations/[timestamp]_add_client_children_tables.sql` ✅
2. `src/components/clients/ClientChildrenManager.tsx` ✅
3. `src/components/policies/wizard/PolicyChildrenSelector.tsx` ✅
4. `src/types/clientChildren.ts` ✅

### Modified Files ✅
1. `src/components/clients/ClientDrawer.tsx` ✅
2. `src/components/policies/wizard/Step1BranchTypeClient.tsx` ✅
3. `src/components/policies/wizard/usePolicyWizardState.ts` ✅
4. `src/components/policies/PolicyWizard.tsx` ✅
5. `src/components/policies/wizard/index.ts` ✅

---

## Acceptance Criteria Checklist

- [x] Customer can add/remove multiple children on create/edit
- [x] Duplicate ID numbers prevented per customer
- [x] Policy wizard shows customer's children for selection
- [x] Policy wizard allows adding new children inline
- [x] Adding child in policy also saves to customer
- [ ] Invoice/PDF shows selected children for that policy
- [ ] SMS templates can include children names
- [x] RLS/branch isolation enforced
- [x] Mobile responsive UI
- [x] RTL layout preserved
