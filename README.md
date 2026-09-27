# Aaina — Creator Marketplace

Aaina is a production-ready influencer/creator marketplace (in the spirit of Viral Pitch). Creators browse brand campaigns, apply, receive products, create content, submit deliverables, and get paid. Employees (admins) create campaigns, review applications & submissions, release payments, and manage referrals — all from a web dashboard.

## Monorepo Structure

```
Aaina/
├── supabase/          # Postgres schema, functions, RLS, storage, seed data
│   ├── migrations/
│   │   ├── 0001_init.sql        # Enums, tables, indexes, app_settings
│   │   ├── 0002_functions.sql   # Triggers, RPCs (payments, withdrawals, referrals, scoring)
│   │   ├── 0003_rls.sql         # Row Level Security policies
│   │   └── 0004_storage.sql     # Storage buckets + policies
│   └── seed.sql                 # Demo campaigns
├── mobile/            # React Native (Expo) creator app
├── admin/             # Vite + React web dashboard for employees
├── render.yaml        # Render.com deployment blueprint (admin)
└── README.md
```

## Tech Stack

| Layer   | Stack |
|---------|-------|
| Backend | Supabase (Postgres, Auth, Storage, Realtime, RPC) |
| Mobile  | Expo SDK 52, Expo Router, NativeWind, Zustand, React Query, Supabase JS |
| Admin   | Vite, React, TypeScript, Tailwind, React Query, React Router, Recharts |

---

## 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migrations **in order**:
   1. `supabase/migrations/0001_init.sql`
   2. `supabase/migrations/0002_functions.sql`
   3. `supabase/migrations/0003_rls.sql`
   4. `supabase/migrations/0004_storage.sql`
3. (Optional) Run `supabase/seed.sql` for demo campaigns.
4. Enable **Realtime** on the `notifications` table.
5. Create your first admin: sign up a user, then run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
6. Copy your **Project URL** and **anon public key** from Project Settings → API.

### Storage Buckets (created by `0004_storage.sql`)
- `avatars` (public)
- `campaign-images` (public) — used by the admin campaign form
- `submission-screenshots` (private)
- `kyc-documents` (private)

---

## 2. Mobile App (Expo)

```bash
cd mobile
cp .env.example .env         # fill EXPO_PUBLIC_SUPABASE_URL / ANON_KEY
npm install
npm run start                # Expo dev server
```

Build binaries with EAS:
```bash
npm run build:android:apk    # preview APK
npm run build:android:aab    # production App Bundle
npm run build:ios
```

> Add real `icon.png` and `splash.png` to `mobile/assets/` (referenced in `app.json`).

---

## 3. Admin Dashboard (Web)

```bash
cd admin
cp .env.example .env         # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173
```

Only accounts with `role = 'admin'` can sign in.

### Admin capabilities
- **Dashboard** — creator count, active campaigns, pending applications/reviews, budget chart.
- **Campaigns** — create/edit campaigns per type (Reimbursement / Barter / Paid) with image upload, **slots**, price/reward, cashback %, follower ranges, deliverables, deadlines, and draft/active status.
- **Applications** — select/reject applicants, advance status through the pipeline.
- **Submissions** — review reel/post/story/YouTube links & screenshots, approve/reject/request revision.
- **Payments** — release campaign payments (`release_campaign_payment` RPC) and approve/reject withdrawals (`approve_withdrawal` RPC).
- **Referrals** — configure per-type referral bonuses and barter minimum followers; view analytics.
- **Notifications** — broadcast announcements to creators.

---

## 4. Deploy Admin to Render.com

### Option A — Static Site (recommended)
The repo includes `render.yaml`. In Render: **New → Blueprint**, point at this repo, and set the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when prompted.

### Option B — Docker
`admin/Dockerfile` builds and serves the app via nginx:
```bash
cd admin
docker build \
  --build-arg VITE_SUPABASE_URL=... \
  --build-arg VITE_SUPABASE_ANON_KEY=... \
  -t aaina-admin .
docker run -p 8080:80 aaina-admin
```

---

## Campaign Types

| Type | What the creator does | Key fields (admin) |
|------|-----------------------|--------------------|
| **Reimbursement** | Buys the product, gets cashback after posting | Product price, cashback %, min followers |
| **Barter** | Receives free product in exchange for content | Product value, min followers (default 500) |
| **Paid** | Gets a cash payout for content | Payout amount, min/max followers |

Every campaign also has: title, brand, image, category, **slots**, deliverables, instructions, deadlines, and status.

---

## Environment Variables

**mobile/.env**
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

**admin/.env**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
