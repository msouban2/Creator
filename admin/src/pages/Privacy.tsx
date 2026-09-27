// Public (no-login) Privacy Policy page.
// Required by Meta App Review as the app's "Privacy Policy URL".
// Reachable at /privacy on the deployed admin site.

import { LegalShell, Section } from "@/components/LegalShell";

const CONTACT_EMAIL = "support@thebilkul.in";
const LAST_UPDATED = "22 August 2026";

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated={LAST_UPDATED}>
      <p>
        Bilkul (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates a creator&ndash;brand
        marketplace that connects social-media creators with brands running promotional campaigns.
        This Privacy Policy explains what information we collect, how we use it, and the choices you
        have. It applies to the Bilkul mobile app and the Bilkul admin dashboard.
      </p>

      <Section title="1. Information we collect">
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information</strong> you provide: name, email address, phone number,
            profile details, and (for payouts) bank/UPI details you choose to add.
          </li>
          <li>
            <strong>Campaign activity</strong>: applications you submit, purchase proofs, review
            screenshots and videos you upload, tracking details, and messages related to a campaign.
          </li>
          <li>
            <strong>Instagram data</strong> (only if you choose to connect your Instagram
            professional account &mdash; see Section 2).
          </li>
          <li>
            <strong>Technical data</strong>: basic device and log information needed to operate and
            secure the service.
          </li>
        </ul>
      </Section>

      <Section title="2. Instagram information">
        <p>
          Connecting Instagram is <strong>optional</strong>. If you connect your Instagram
          professional (Business or Creator) account using &ldquo;Instagram API with Instagram
          Login&rdquo;, you grant us access via the
          <code> instagram_business_basic </code> and
          <code> instagram_business_manage_insights </code> permissions. With your consent we read
          and store:
        </p>
        <ul>
          <li>Your Instagram user ID, username, and profile URL</li>
          <li>Your follower count and account type</li>
          <li>
            Aggregated insights: reach, profile views, average likes, average comments, and a
            derived engagement rate
          </li>
          <li>
            An access token (stored securely on our server) used to refresh the above; we never
            expose it to the app or to brands
          </li>
        </ul>
        <p>
          We use this information solely to (a) verify that a creator&rsquo;s audience matches a
          campaign, and (b) show brands the performance of the campaigns they run. We do
          <strong> not </strong> post to your Instagram, read your direct messages, or access
          followers&rsquo; personal data. You can disconnect Instagram at any time (see Section 6),
          which stops all further data access and removes the stored Instagram data.
        </p>
      </Section>

      <Section title="3. How we use your information">
        <ul>
          <li>To operate the marketplace and match creators with campaigns</li>
          <li>To let brands review submissions and verify audience and performance</li>
          <li>To process campaign fulfilment, shipping, and payouts</li>
          <li>To communicate with you about your account and campaigns</li>
          <li>To secure the service and comply with legal obligations</li>
        </ul>
      </Section>

      <Section title="4. How we share information">
        <p>
          We share only what is necessary. Brands can see campaign-related content you
          submit and <strong>aggregated</strong> audience/performance figures &mdash; never your
          Instagram access token, and never contact details beyond what a campaign requires. We use
          trusted infrastructure providers (such as Supabase for database and storage) to run the
          service. We do not sell your personal information.
        </p>
      </Section>

      <Section title="5. Data retention">
        <p>
          We keep your information for as long as your account is active or as needed to provide the
          service and meet legal requirements. When you disconnect Instagram or delete your account,
          we remove the associated data as described in Section 6.
        </p>
      </Section>

      <Section title="6. Your choices and data deletion">
        <ul>
          <li>
            <strong>Disconnect Instagram</strong> at any time from the app; this revokes our access
            and deletes the stored Instagram fields (username, tokens, followers, insights).
          </li>
          <li>
            <strong>Delete your account and data</strong> by following the steps on our{" "}
            <a href="/data-deletion">Data Deletion</a> page or by emailing us.
          </li>
          <li>Request access to or correction of your information by contacting us.</li>
        </ul>
      </Section>

      <Section title="7. Security">
        <p>
          We use industry-standard measures to protect your data, including encrypted transport,
          access controls, and server-side storage of sensitive tokens. No method of transmission or
          storage is 100% secure, but we work to protect your information.
        </p>
      </Section>

      <Section title="8. Children">
        <p>Bilkul is not intended for anyone under 18, and we do not knowingly collect their data.</p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by the
          &ldquo;Last updated&rdquo; date at the top of this page.
        </p>
      </Section>

      <Section title="10. Contact us">
        <p>
          Questions about this policy or your data? Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
