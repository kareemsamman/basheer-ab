
# Fix Marketing SMS - Batch Sending + Bug Fix

## Problem
The campaigns with 1087 recipients are stuck at "sending" because:
1. **Bug**: Duplicate `const sentCount` on lines 218 and 231 causes a compilation error
2. **Timeout**: Sending 1087 SMS sequentially (100ms delay each = ~109 seconds) exceeds the edge function timeout (~60s)
3. Both campaigns only sent ~300 messages before timing out, leaving ~750 recipients as "pending"

## Solution

### 1. Fix `send-marketing-sms` Edge Function
- Remove duplicate `const sentCount` declaration (line 231)
- Change approach: send in batches of **200 recipients per invocation**
- If there are more than 200 recipients, send the first 200, then trigger itself again for the next batch
- Campaign stays in "sending" status until all batches complete

### 2. Add batch continuation logic
- New flow: `send-marketing-sms` accepts optional `batch_offset` parameter
- First call: creates campaign, inserts all recipients, sends first 200
- After sending 200: if more remain, invoke itself with `batch_offset` for next batch
- Last batch: marks campaign as "completed"

### 3. Fix stuck campaigns
- The two stuck campaigns (f0122170... and fa0edb77...) have 785 and 749 recipients still "pending"
- Add a "retry pending" feature in the UI to re-send unsent recipients from stuck campaigns

### Technical Details

**File: `supabase/functions/send-marketing-sms/index.ts`**

- Remove duplicate `const sentCount` (line 231)
- Add `batch_offset` and `campaign_id` to request body for continuation
- Process max 200 recipients per invocation
- After batch completes:
  - If more recipients remain: call self with next offset
  - If all done: update campaign to "completed"
- Add resume mode: if `campaign_id` is provided (continuation), skip campaign creation and recipient insertion

**File: `src/pages/MarketingSms.tsx`**

- Add "إعادة إرسال المعلقين" (Retry Pending) button for stuck campaigns (status = "sending")
- This button calls the edge function with the existing campaign_id to resume sending to "pending" recipients
- Show clearer status: "جاري الإرسال (302/1087)" instead of just "جاري الإرسال"
