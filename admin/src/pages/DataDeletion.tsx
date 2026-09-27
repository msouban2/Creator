// Public (no-login) Data Deletion Instructions page.
// Satisfies Meta App Review's "User Data Deletion" requirement (instructions URL).
// Reachable at /data-deletion on the deployed admin site.

import { LegalShell, Section } from "@/components/LegalShell";

const CONTACT_EMAIL = "support@thebilkul.in";
const LAST_UPDATED = "22 August 2026";

export default function DataDeletion() {
  return (
    <LegalShell title="Data Deletion" updated={LAST_UPDATED}>
      <p>
        You can remove your data from Bilkul at any time. This page explains how to disconnect your
        Instagram account and how to delete your Bilkul account entirely.
      </p>

      <Section title="Disconnect Instagram (removes Instagram data only)">
        <p>
          If you only want to revoke Bilkul&rsquo;s access to your Instagram professional account and
          delete the Instagram data we stored (username, tokens, follower count, and insights):
        </p>
        <ol>
          <li>Open the Bilkul app and go to your profile.</li>
          <li>
            Tap <strong>Disconnect Instagram</strong>.
          </li>
          <li>
            We immediately revoke the stored access token and remove the associated Instagram fields
            from your profile.
          </li>
        </ol>
        <p>
          You can also remove Bilkul from{" "}
          <a
            href="https://www.instagram.com/accounts/manage_connected_accounts/"
            target="_blank"
            rel="noreferrer"
          >
            Instagram &rsaquo; Settings &rsaquo; Apps and Websites
          </a>
          .
        </p>
      </Section>

      <Section title="Delete your entire Bilkul account and data">
        <p>To permanently delete your Bilkul account and all associated personal data:</p>
        <ol>
          <li>
            Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the email
            address registered with your account, with the subject line{" "}
            <strong>&ldquo;Delete my account&rdquo;</strong>.
          </li>
          <li>
            We will verify the request and delete your account, profile, uploaded content, and any
            connected Instagram data within <strong>30 days</strong>.
          </li>
          <li>You will receive a confirmation once the deletion is complete.</li>
        </ol>
        <p>
          Some records may be retained where required by law (for example, transaction records for
          tax/accounting), and are deleted once those obligations expire.
        </p>
      </Section>

      <Section title="What gets deleted">
        <ul>
          <li>Your profile and account details</li>
          <li>Instagram username, access token, follower count, and insights</li>
          <li>Campaign applications, purchase proofs, review screenshots and videos you uploaded</li>
          <li>Payout and shipping details you provided</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          Need help? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&rsquo;ll
          assist you.
        </p>
      </Section>
    </LegalShell>
  );
}
