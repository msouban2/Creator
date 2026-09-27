# Go-live checklist (Development → Live, no Play Store)

## 🟩 Done for you (in this repo / deployed)
- [x] Public **Privacy Policy** page → `/privacy`
- [x] Public **Data Deletion** page → `/data-deletion`
- [x] App Review permission descriptions → `01-review-descriptions.md`
- [x] Screencast script → `02-screencast-script.md`
- [x] Verified OAuth uses the correct API + scopes (see "OAuth facts" below)

## 🟦 You must do (Meta dashboard / business / identity)

### 1. App settings (App Dashboard → App Settings → Basic)
- [ ] App icon (1024×1024)
- [ ] **Privacy Policy URL** = `https://<your-domain>/privacy`
- [ ] **User data deletion** = `https://<your-domain>/data-deletion`
      (choose "Data deletion instructions URL")
- [ ] Category + contact email + app domain

### 2. Business Verification (Meta Security Center / Verification)
- [ ] Submit business documents (GST / Udyam / registration / utility bill)
- [ ] Wait for approval (needed for Advanced Access to insights)

### 3. App Review (App Dashboard → App Review → Permissions and Features)
- [ ] Request **Advanced Access**: `instagram_business_basic`
- [ ] Request **Advanced Access**: `instagram_business_manage_insights`
- [ ] Paste descriptions from `01-review-descriptions.md`
- [ ] Upload the screencast (script in `02-screencast-script.md`)
- [ ] Add test creator credentials in the notes if requested

### 4. Flip to Live
- [ ] Once Advanced Access is approved + settings complete, toggle the app
      **Development → Live** (switch at top of dashboard)

### 5. Before you record (reminder)
- [ ] Add your test IG professional account under App → Roles → **Instagram Testers**
      and accept the invite in that Instagram account

---

## OAuth facts (already correct in the code — for your reference)
- Authorize URL: `https://www.instagram.com/oauth/authorize`
- Scopes requested: `instagram_business_basic,instagram_business_manage_insights`
- Redirect URI (must EXACTLY match the "Valid OAuth Redirect URI" in the Meta app and the
  `IG_REDIRECT_URI` secret in Supabase):
  `https://<supabase-ref>.supabase.co/functions/v1/instagram-oauth/callback`
- Secrets set in Supabase → Edge Functions → Secrets: `IG_CLIENT_ID`, `IG_CLIENT_SECRET`,
  `IG_REDIRECT_URI`
- Token is exchanged for a long-lived token and stored **server-side only**; the mobile app
  and brands never see it. ✅ This is exactly what reviewers want.

## ⚠️ Before submitting, double-check
- [ ] The **Valid OAuth Redirect URIs** list in the Meta app contains the exact callback URL
      above (a trailing-slash or http/https mismatch will fail the flow).
- [ ] The email in the Privacy/Data-Deletion pages (`privacy@aaina.app` placeholder) is
      changed to a **real inbox you monitor** (edit `admin/src/pages/Privacy.tsx` and
      `admin/src/pages/DataDeletion.tsx`).
