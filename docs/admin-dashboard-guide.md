# Bilkul Admin Dashboard — Complete Guide

This guide explains **every page and feature** of the Bilkul admin console (the web app at `aaina-admin.onrender.com`). It is written for admins, employees, and sellers so anyone can understand what they can do and how.

---

## 1. Who can log in, and what they see

There are **three kinds of accounts**, and the dashboard looks different for each:

| Role | How they sign in | What they see |
| --- | --- | --- |
| **Admin** | Email + password | **Everything** — all pages, all controls. |
| **Employee** | Email + password | Only the **sections an admin granted** them (e.g. only Review Queue + KYC). |
| **Seller** | Google sign-in | A restricted, **read-only-ish** console (Overview / Orders / Products) — never sees creator identities. |

- **Admins and employees must use email + password.** Google sign-in is only for sellers; if a non-seller signs in with Google they are signed out automatically.
- The **left sidebar** shows only the pages you have access to. The **top-right bell** is your notifications (explained in section 14).

---

## 2. The sidebar at a glance

Staff pages (admin sees all; employees see what's granted):

- **Dashboard** — the health overview of the whole platform.
- **Campaigns** — create and manage brand campaigns.
- **Applications** — a read-only monitor of every creator application.
- **Creators** — the list of all creators (users).
- **Review Queue** — the employee's hands-on workspace to process one item at a time.
- **Instagram Requests** — approve creators' Instagram verification.
- **Submissions** — cross-check reviewed content and release payments.
- **Order Tracking** — per-order logistics records.
- **KYC Verification** — verify creator PAN / Aadhaar / bank.
- **Payments** *(admin only)* — process creator withdrawals.
- **Seller Management** — handle sellers end-to-end (brands, campaigns, orders, payments).
- **Referrals** *(admin only)* — referral program overview.
- **Notifications** *(admin only)* — send announcements to creators.
- **Employees** *(admin only)* — add team members and grant permissions.

Seller pages (sellers only): **Overview**, **Orders**, **Products**.

---

## 3. Common controls you'll see everywhere

- **Date range filter** — a row of chips: *All time · Today · 7 days · 30 days · This month · This year · Custom*. It filters the figures on that page by date. On **Dashboard, Applications, Creators, Seller Management,** and the **seller pages**.
- **Search box** — on **Applications** and **Submissions**. Type an **LRMS number** (e.g. `LRMS-14` or just `14`) or a creator/campaign name to jump to it.
- **Expand arrow (›)** — many tables have a chevron on the left of each row. Click it to open a detail panel underneath (proofs, content, insights, notes).
- **Status badges** — coloured pills showing the current state (pending / approved / shipped, etc.).
- **LRMS reference** — every application and review has a permanent code shown in a **Ref** column:
  - `LRMS-<n>-ORD` = an application/order
  - `LRMS-<n>-SHIP` = the shipment side of an order
  - `LRMS-<n>-REV` = a content review
  These are unique and never change, so staff and sellers can quote them to each other.

---

## 4. Dashboard

**Purpose:** a single screen showing how the whole platform is doing.

What's on it (all respect the date-range filter at the top):

- **Top metric cards** — totals like creators, active campaigns, applications, money in wallets, etc.
- **"Needs action" tiles** — clickable counters (e.g. applications waiting on staff, submissions to review). Clicking a tile jumps you to the right page already filtered.
- **Fulfilment strip** — Shipped / Delivered / In review / Completed counts across all orders.
- **Seller money strip** — total Received / Used / Remaining across all sellers.

Use the Dashboard first thing each day to see what needs attention.

---

## 5. Campaigns

**Purpose:** create and manage the brand campaigns creators apply to.

Each campaign has a **type**:

- **Barter** — the creator gets a free product in exchange for content.
- **Paid** — the creator gets a product **and** a cash reward for content.
- **Reimbursement** — the creator **buys** the product themselves and is **reimbursed** (product price = their cashback; there is no extra amount).

What you can do:

- **Create a campaign** — set title, brand, product, type, reward amount, eligibility (e.g. minimum followers), tasks, do's & don'ts, and sample images.
- **Attach a seller** — link the campaign to the seller who funds/fulfils it.
- **Edit or pause** a campaign.
- For **reimbursement** campaigns there's a monthly limit control (how many reimbursements per creator per month).

---

## 6. Applications (monitor)

**Purpose:** a **read-only overview** of every creator application across all campaigns. This is your "control tower" — you *watch* here, but you *act* in the **Review Queue**.

Features:

- **Buckets** — quick tabs: *Needs action · Waiting on creator · Completed · Rejected · All*.
- **Filters** — by campaign type, brand, seller, and date range.
- **Search** — by LRMS ref, creator, or campaign.
- **Columns** — Ref, Creator, Campaign, Type, Followers, Status, and **Next step** (what's expected next and who owes it).
- **Expand a row** to see: product link, purchase proof, delivery photo, submitted content, creator insights, shipping details, and the **internal notes thread** (section 13).

> The Action column says **"Monitor only"** — to actually select/reject/ship/approve, use the Review Queue.

---

## 7. Creators (Users)

**Purpose:** the directory of all creators on the platform.

- **Search and date-filter** (by join date).
- See each creator's profile: name, contact, followers/insights, KYC status, earnings, referral info.
- Use it to look someone up or check their standing.

---

## 8. Review Queue ⭐ (the employee's main workspace)

**Purpose:** the place where an employee **processes work one item at a time**, safely. This is the heart of the employee's day.

How it works:

- Click **Claim next** and the system hands you the **oldest waiting item of your assigned types** and **locks it to you** for 15 minutes, so **two employees never work the same item**.
- You get the **full cross-verification view**: purchase video, delivered photo, review screenshots, the campaign & product, purchase & timing details, and an info strip (Creator / Campaign / Type / Followers / Status / Next step).
- **All the lifecycle actions live here:**
  - **Select / Reject** an applicant (when they first apply).
  - **Mark Shipped / Mark Delivered** (barter & paid logistics).
  - **Approve Draft / Request Correction** (for paid campaigns' draft videos).
  - **Approve / Request revision / Reject** the final submission.
- **Skip** returns the item to the pool for someone else.
- Every action is written automatically into the item's **notes thread** as a **System** entry (an audit log), and the notes thread is right there for you to add comments too.

> Employees only see the campaign **types** an admin assigned them (Barter / Reimbursement / Paid). If none are assigned, the page tells them to ask an admin.

---

## 9. Submissions (cross-check + pay)

**Purpose:** where a **second person** cross-verifies content that's been reviewed, and where **payment is released**.

- Filter by status (pending / approved / revision / rejected) and **search by LRMS-REV**.
- Expand a row to see all the proofs and the **notes thread**.
- **Release payment** — pays the creator the correct amount (for reimbursement it shows the refund breakdown). This is logged in the thread as *"Released payment of ₹X"*.
- **Send back for re-review** — if the cross-check finds a problem, send it back to the reviewing employee with a reason; it returns to their Review Queue and the reason is posted in the thread.
- A **"🔒 in review by [name]"** hint shows when an item is currently claimed by someone.

Think of it as: **Review Queue = first review; Submissions = supervisor cross-check + payout.**

---

## 10. Instagram Requests

**Purpose:** approve creators who want their Instagram verified (a manual bridge until fully automated).

The flow:

1. A creator enters their Instagram username in the app → it appears here as **Pending**.
2. **You** add that username as a tester in the **Meta App dashboard** and send them the invite (this can take ~24 hours for them to accept).
3. Click **Mark Invited** → the creator gets a notification: *"You've been added! Tap Connect Instagram."*
4. When they connect, click **Mark Connected**. If something's wrong, **Reject** with a reason (the creator is notified).

Filter by status; each row shows the creator, their @handle (clickable), status, and request date.

---

## 11. KYC Verification

**Purpose:** verify each creator's identity and bank details so they can be paid.

- Filter by status (pending / verified / rejected) and open documents.
- Verification is **real-time via the provider (FinPayUltra)**:
  - **PAN** — confirms the PAN and shows the **registered name**.
  - **Aadhaar** — a 2-step OTP flow; confirms the **name on Aadhaar**.
  - **Bank** — a penny-less check that confirms the **name at the bank**.
- When a check passes, the row shows a green **"API-verified"** badge with the verified name.
- You can still **Approve** / **Reject** manually (rejection reason is sent to the creator).

> **Payouts are gated on KYC:** a creator cannot withdraw until their **Aadhaar is verified**, and a **bank-transfer** withdrawal must go to a **verified bank account**.

---

## 12. Payments *(admin only)*

**Purpose:** process the withdrawal requests creators submit from the app.

- See each pending withdrawal (amount, method — UPI or bank transfer, destination).
- **Mark paid** (record the UTR / reference) or **reject** (which refunds the amount back to the creator's wallet).
- Withdrawals already passed the KYC gate before they reach you.

> **Note:** campaign earnings are **released from the Submissions page** (see section 9), which credits the creator's wallet. The Payments page only handles paying that wallet balance out to the bank/UPI.

---

## 13. Internal notes thread (on Applications, Submissions, Review Queue)

**Purpose:** a private, **staff-only** discussion + audit log attached to each application/review.

- **Manual notes** — any staff member can type a note (e.g. *"caption is wrong, review again"* / *"corrected, release payment"*). Each note shows **who wrote it** and their role (Admin/Employee).
- **System entries** — key actions are logged **automatically** (Selected applicant, Marked shipped, Approved submission, Released payment, etc.), shown as muted **"System"** lines. This gives you a full history of the item — like an LRMS log.
- **Notifications** — when someone posts a **manual** note, the **other people involved** (everyone already on the thread + the item's reviewer/claimer) get a notification. System entries don't notify.
- Each thread shows its **LRMS-REV** code at the top.

Creators and sellers **never** see these internal notes.

---

## 14. Notifications (the bell 🔔)

**Purpose:** know when something needs you, without refreshing.

- The **bell in the top-right** shows an unread count and a dropdown of recent notifications.
- Notifications are created automatically for:
  - **Order messages** (seller ⇄ employee — see Seller Management, section 15).
  - **Internal review notes** (staff ⇄ staff — section 13).
- **Click a notification to jump straight to it** — it opens the right page filtered/highlighted to that exact LRMS record.
- **Mark all read** clears the count.
- Sellers' bell **never** shows internal staff notifications.

> The **Notifications page** in the sidebar (admin only) is different — it's for **sending announcements to creators**, not the bell.

---

## 15. Seller Management ⭐ (the seller-handling employee's workspace)

**Purpose:** one place for an employee (or admin) to handle **everything about sellers**. Grant an employee the **"Seller Management"** permission and this becomes their main page.

Top of the page: a **"What to do here"** checklist, totals across all sellers (Sellers / Received / Used / Remaining), a **date-range filter**, and a **search**.

**Expand any seller** to get their full workspace:

- **Brands** — add/remove the brands this seller runs.
- **Campaigns** — their campaigns with type, status, reward, and order progress (done/total).
- **Order & shipment breakdown** — counts of To ship / In transit / Delivered.
- **Orders to fulfil** — *for barter & paid only* (reimbursement is bought by the creator, so it's not shipped). Each order shows the **Ref (LRMS-SHIP), creator, product, full ship-to address, shipment status, and tracking/code**. Click **Manage** to:
  - update **shipment status** (pending → shipped → delivered),
  - record the **tracking ID** and **discount code**,
  - and use the **order conversation thread** with the seller.
- **Budget by brand** — Received / Used / Remaining per brand.
- **Record payment** — log money received from the seller (optionally tagged to a brand and date).

**The order conversation (LRMS-style):** the employee and the seller message each other **per order**. Each message shows **who sent it** (Team / Seller badge). When either side posts, the **other side is notified** — so the employee can ask *"please share the discount code for LRMS-5-SHIP"* and the seller replies right there. Notifications are clickable and jump to that order.

---

## 16. Seller console (what a **seller** sees)

Sellers sign in with Google and get **three pages** — and they **never see a creator's identity** (creators are shown as "Creator 1, Creator 2…"). They **do** see the **delivery name + address** on orders they must ship (they can't post a parcel otherwise), but never the creator's social profile.

1. **Overview** — budget & activity at a glance (summary stats, budget by brand), with a date filter.
2. **Orders** — *Orders to fulfil* (barter & paid). The seller sees the ship-to name+address, updates **shipment status**, submits **tracking / discount code**, and uses the **order thread** with the team. Also a live "Where your orders are" status count per product.
3. **Products** — how each product is doing: per-product order journey, reimbursement reviews, and barter/paid creator content (screenshots, videos, reels, engagement).

---

## 17. Referrals *(admin only)*

**Purpose:** overview of the creator referral program — total referrals, bonuses awarded, and per-creator details.

---

## 18. Employees *(admin only)*

**Purpose:** manage your team and control exactly what each person can access.

- **Add a team member** — create an employee (or register a seller).
- **Grant sections** — tick the pages each employee may access (Dashboard, Campaigns, Applications, Creators, Review Queue, Instagram Requests, Submissions, Order Tracking, KYC, Seller Management). They only see what you tick.
- **Assign review types** — give an employee Barter / Reimbursement / Paid so the **Review Queue** feeds them the right items.
- This page also lists sellers.

**Example setups:**
- A **content reviewer**: grant *Review Queue* + *Submissions*, assign the campaign types they should handle.
- A **seller manager**: grant *Seller Management* (and optionally *Order Tracking*).
- A **KYC/onboarding agent**: grant *KYC Verification* + *Instagram Requests*.

---

## 19. Order Tracking

**Purpose:** a per-order logistics ledger — one row per creator order, with order counts, payments, and shipment status, grouped by product. Useful for a logistics-focused overview separate from the per-seller view.

---

## 20. Typical end-to-end flows

**A. A barter/paid order, start to finish**
1. Creator applies → appears in **Applications** (monitor) and the employee's **Review Queue**.
2. Employee **Selects** the applicant (Review Queue).
3. **Seller Management / Seller console:** the order shows under **Orders to fulfil**. The seller (or employee) ships it, sets **Shipped**, and records **tracking/code**. They coordinate in the **order thread**; both get **notifications**.
4. Employee **Marks Delivered** when it arrives.
5. Creator posts content → it enters **Review Queue**; employee **Approves**.
6. **Submissions:** a supervisor cross-checks and **Releases payment** (or sends it back).
7. All steps are logged in the item's **notes thread** with LRMS references.

**B. A reimbursement order**
1. Creator applies and is **Selected**.
2. Creator **buys the product themselves** and uploads the purchase proof + order details.
3. Content is reviewed in the **Review Queue**.
4. **Submissions:** cross-check and **Release payment** (the product price is refunded as cashback; no shipping is involved, so it does **not** appear in Orders to fulfil).

**C. Onboarding a creator for payouts**
1. Creator submits **KYC** → you verify PAN/Aadhaar/Bank (real-time).
2. Creator requests **Instagram** verification → you invite them via Meta and **Mark Invited/Connected**.
3. Once Aadhaar is verified and a bank account is verified, the creator can **withdraw**, which you process in **Payments**.

---

## 21. Quick reference — where do I…?

| I want to… | Go to |
| --- | --- |
| See overall platform health | **Dashboard** |
| Create/edit a campaign | **Campaigns** |
| Select/reject an applicant, mark shipped/delivered, approve content | **Review Queue** |
| Cross-check content & pay a creator | **Submissions** |
| Just watch application status | **Applications** |
| Verify a creator's PAN/Aadhaar/bank | **KYC Verification** |
| Approve an Instagram connect | **Instagram Requests** |
| Process a withdrawal | **Payments** *(admin)* |
| Handle a seller's brands/orders/payments | **Seller Management** |
| Ship an order / share a code (as a seller) | **Orders** (seller console) |
| Message the team/seller about an order | The **order thread** on that order |
| Give an employee access | **Employees** *(admin)* |
| Find something by its code | The **search box** (type `LRMS-<n>`) |
