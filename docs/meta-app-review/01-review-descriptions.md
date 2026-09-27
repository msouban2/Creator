# App Review — permission descriptions (copy-paste)

In the Meta App Dashboard → **App Review → Permissions and Features**, request **Advanced
Access** for each permission below and paste the matching text. Keep it factual and match
exactly what the app does — mismatches are the #1 rejection reason.

---

## App / use-case summary (use if a general description is asked)

> Aaina is a creator–brand marketplace. Social-media creators connect their own Instagram
> professional (Business or Creator) account to Aaina so that brands running promotional
> campaigns can verify the creator's audience size and see the performance of the campaigns
> they run. Creators opt in explicitly via Instagram Login. Aaina only reads the connected
> creator's own basic profile and aggregated insights — it never posts content, reads
> messages, or accesses other users' data. Access can be revoked by the creator at any time,
> which deletes the stored Instagram data.

---

## Permission: `instagram_business_basic`

**Why the app needs it**

> We use `instagram_business_basic` to let a creator connect their own Instagram professional
> account and to read their basic profile: user ID, username, account type, and follower
> count. Aaina shows this to brands so they can confirm the creator's identity and audience
> size before approving them for a campaign. The data is read only for the creator who
> authenticated and only with their consent.

**How the user benefits**

> Creators get matched to campaigns that fit their audience without manually entering or
> screenshotting their stats, and their identity/reach is verified automatically.

**Step-by-step (what the reviewer will see)**

> 1. In the Aaina app, the creator opens Profile and taps "Connect Instagram".
> 2. They are sent to Instagram Login and approve the requested permissions.
> 3. Aaina reads their username and follower count and displays it on their profile.

---

## Permission: `instagram_business_manage_insights`

**Why the app needs it**

> We use `instagram_business_manage_insights` to read aggregated insights for the connected
> creator's own account — reach, profile views, and average likes/comments across recent
> media — from which we derive an engagement rate. Aaina shows these aggregated figures to
> brands so they can evaluate campaign performance and decide payouts. We do not access
> insights for any account other than the authenticated creator's own.

**How the user benefits**

> Creators can prove real engagement (not just follower count) so they qualify for more and
> better-paying campaigns; brands see genuine performance data instead of manual screenshots.

**Step-by-step (what the reviewer will see)**

> 1. After the creator connects Instagram (previous step), Aaina reads reach, profile views,
>    and recent-media likes/comments for that creator's account.
> 2. These are aggregated into reach / profile views / average engagement figures.
> 3. The figures appear on the creator's performance card that brands review.

---

## Notes for the reviewer field (optional but helps)

> A test Instagram professional account and Aaina test login can be provided. The Instagram
> connect flow uses "Instagram API with Instagram Login" (authorize URL
> instagram.com/oauth/authorize) with scopes instagram_business_basic and
> instagram_business_manage_insights. The access token is exchanged and stored only
> server-side (Supabase Edge Function) and is never exposed to the mobile client or to brands.
