// Public (no-login) Terms of Service page.
// Used as the "Terms of Service URL" in Meta App Settings.
// Reachable at /terms on the deployed admin site.

import { LegalShell, Section } from "@/components/LegalShell";

const CONTACT_EMAIL = "support@thebilkul.in";
const LAST_UPDATED = "22 August 2026";

export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated={LAST_UPDATED}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Bilkul (&ldquo;Bilkul&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;), a creator&ndash;brand marketplace that
        connects social-media creators with brands running promotional campaigns. By using the Bilkul
        mobile app or admin dashboard, you agree to these Terms. If you do not agree, please do not
        use the service.
      </p>

      <Section title="1. Who can use Bilkul">
        <p>
          You must be at least 18 years old and able to form a binding contract. If you use Bilkul on
          behalf of a business or brand, you confirm you are authorised to do so.
        </p>
      </Section>

      <Section title="2. Your account">
        <ul>
          <li>You are responsible for the accuracy of the information you provide.</li>
          <li>You are responsible for keeping your login credentials secure.</li>
          <li>You are responsible for all activity that happens under your account.</li>
        </ul>
      </Section>

      <Section title="3. How the marketplace works">
        <ul>
          <li>
            <strong>Creators</strong> apply to campaigns, complete the required actions (for example
            buying a product, or receiving a barter product), and upload the required proofs and
            review content.
          </li>
          <li>
            <strong>Brands</strong> create campaigns, review submissions, fulfil orders,
            and approve payouts or rewards according to each campaign&rsquo;s terms.
          </li>
          <li>
            The specific reward (cashback, product worth, or payment) for each campaign is shown on
            that campaign and forms part of the agreement for that campaign.
          </li>
        </ul>
      </Section>

      <Section title="4. Connecting Instagram">
        <p>
          Connecting your Instagram professional account is optional and governed by our{" "}
          <a href="/privacy">Privacy Policy</a>. You confirm the account you connect is yours and
          that you have the right to share its data with Bilkul. You can disconnect it at any time.
        </p>
      </Section>

      <Section title="5. Content you submit">
        <p>
          You retain ownership of the content you upload (screenshots, videos, purchase proofs). By
          submitting content for a campaign, you grant Bilkul and the relevant brand a limited licence
          to use that content for the purpose of running, reviewing, and verifying that campaign. You
          are responsible for ensuring your content is accurate and does not infringe anyone
          else&rsquo;s rights.
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Submit fake, misleading, purchased, or manipulated engagement or proofs.</li>
          <li>Impersonate another person or misrepresent your audience.</li>
          <li>Attempt to access accounts, data, or systems you are not authorised to use.</li>
          <li>Use the service for any unlawful purpose.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate these Terms.</p>
      </Section>

      <Section title="7. Payments and rewards">
        <p>
          Rewards and payouts are subject to each campaign&rsquo;s stated conditions and to
          successful verification of the required proofs. We may withhold or reverse a reward where
          fraud, policy violations, or invalid submissions are detected.
        </p>
      </Section>

      <Section title="8. Intellectual property">
        <p>
          The Bilkul name, app, and dashboard, excluding user-submitted content, are owned by us and
          protected by applicable laws. You may not copy, modify, or redistribute them without our
          permission.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <p>
          The service is provided &ldquo;as is&rdquo; without warranties of any kind. We do not
          guarantee that the service will be uninterrupted, error-free, or that any particular
          campaign, reward, or result will be available.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Bilkul will not be liable for any indirect,
          incidental, or consequential damages arising from your use of the service. Our total
          liability for any claim is limited to the amount you paid us (if any) in connection with
          that claim.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          You may stop using Bilkul at any time and request deletion of your account via our{" "}
          <a href="/data-deletion">Data Deletion</a> page. We may suspend or terminate access if you
          breach these Terms or misuse the service.
        </p>
      </Section>

      <Section title="12. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by the
          &ldquo;Last updated&rdquo; date at the top of this page. Continued use after changes means
          you accept the updated Terms.
        </p>
      </Section>

      <Section title="13. Governing law">
        <p>These Terms are governed by the laws of India.</p>
      </Section>

      <Section title="14. Contact us">
        <p>
          Questions about these Terms? Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
