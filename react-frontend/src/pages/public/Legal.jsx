import PublicLayout from "./PublicLayout";
import useLegal from "../../useLegal";

function OperatorDetails({ operator }) {
  return (
    <address className="legalAddress">
      {operator.name}
      {operator.address.map((line) => (
        <span key={line}>
          <br />
          {line}
        </span>
      ))}
      <br />
      Email: <a href={`mailto:${operator.email}`}>{operator.email}</a>
    </address>
  );
}

const NotPublished = () => (
  <p className="publicNote">
    These details haven't been published yet. GawainBook doesn't collect waitlist sign-ups until they are.
  </p>
);

export function Impressum() {
  const { status, operator } = useLegal();
  return (
    <PublicLayout>
      <h1>Impressum</h1>
      <p className="publicLead">Legal notice (Angaben gemäß § 5 DDG)</p>
      {status === "loading" ? <p aria-busy="true">Loading…</p> : operator ? <OperatorDetails operator={operator} /> : <NotPublished />}
      {operator && (
        <>
          <h2>Responsible for content</h2>
          <p>{operator.name} (address as above)</p>
        </>
      )}
    </PublicLayout>
  );
}

// Plain-language privacy notice. Have it reviewed (or use a reputable German
// generator) before the public launch; see the launch plan, section 12.
export function Privacy() {
  const { status, operator, privacyVersion } = useLegal();
  return (
    <PublicLayout wide>
      <h1>Privacy notice</h1>
      <p className="publicLead">
        What GawainBook collects, why, and your rights. {privacyVersion && <>Version {privacyVersion}.</>}
      </p>

      <h2>Who is responsible</h2>
      {status === "loading" ? <p aria-busy="true">Loading…</p> : operator ? <OperatorDetails operator={operator} /> : <NotPublished />}

      <h2>Waitlist</h2>
      <p>
        If you join the waitlist we store your email address, your favourite genre, whether you organise a book club,
        and when you agreed to this notice. We use them only to invite you to the beta and to plan which reading
        circles to start. The legal basis is your consent (Art. 6(1)(a) GDPR). We delete your details when the beta
        invitations are finished, or earlier if you ask.
      </p>

      <h2>Accounts</h2>
      <p>
        If you create an account we store your username, email address, a secure hash of your password (never the
        password itself), when you accepted the terms, your profile and reading profile, your shelves and how far
        you've read, the circles you're in, your posts, photos, discussions, replies and likes, who you follow and
        block, and reports you make, so the service can work (Art. 6(1)(b) GDPR). Signing in sets one essential
        cookie that keeps you signed in, and one security cookie that protects against forged requests. We don't use
        advertising or tracking cookies, so there's no cookie banner.
      </p>
      <p>
        How far you've read is private: other readers only see it inside circles you share, so discussions can
        stay spoiler-free.
      </p>

      <h2>Emails</h2>
      <p>
        We email you only about your account: to confirm your address and to reset your password. We don't send
        newsletters or advertising.
      </p>

      <h2>Minimum age</h2>
      <p>You must be at least 16 to create an account (Art. 8 GDPR and German law).</p>

      <h2>Service providers</h2>
      <ul>
        <li>Render (hosting of the website and server)</li>
        <li>Neon (database and photo storage, United States region)</li>
        <li>Resend (sending account emails)</li>
        <li>
          Open Library, run by the Internet Archive (book search: our server sends only the search words, never who
          searched; book covers load from the Internet Archive)
        </li>
      </ul>
      <p>
        They process data only on our behalf. Where data is processed outside the EU, it's protected by the provider's
        data processing agreement and standard contractual clauses.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, have it corrected or deleted, restrict or object to its use, take it with
        you, and withdraw consent at any time without affecting earlier processing. You can download all your data
        and delete your account yourself under <strong>Settings</strong>; deleting removes everything, and circles
        you organise pass to their moderator or longest-standing member. For anything else, email the address above.
        You can also complain to a data protection authority.
      </p>
    </PublicLayout>
  );
}

// Terms of use (keep in step with TERMS_VERSION in Node-Rest-API/src/legal.ts).
export const TERMS_VERSION = "2026-11-12";

export function Terms() {
  const { status, operator } = useLegal();
  return (
    <PublicLayout wide>
      <h1>Terms of use</h1>
      <p className="publicLead">The short, plain rules for using GawainBook. Version {TERMS_VERSION}.</p>

      <h2>Who runs GawainBook</h2>
      {status === "loading" ? <p aria-busy="true">Loading…</p> : operator ? <OperatorDetails operator={operator} /> : <NotPublished />}

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16.</li>
        <li>One person per account. Keep your password to yourself; you're responsible for what happens with your account.</li>
        <li>You can download your data or delete your account at any time under Settings.</li>
      </ul>

      <h2>Be kind, and don't spoil</h2>
      <ul>
        <li>Be respectful. No harassment, hate, threats, or sharing other people's private details.</li>
        <li>
          Respect the chapter you're discussing: put later-chapter details only in discussions for those chapters.
          Spoilers in the wrong place can be hidden.
        </li>
        <li>No spam, advertising or self-promotion without a circle organiser's permission.</li>
        <li>Nothing illegal, and nothing sexual involving minors, ever.</li>
      </ul>

      <h2>What you post</h2>
      <ul>
        <li>
          You keep the rights to what you write and upload. You allow us to store and show it to the readers you share
          it with, only so GawainBook can work. This ends when you delete it or your account.
        </li>
        <li>Only upload photos you have the right to share. Don't post whole chapters of books that are still in copyright.</li>
      </ul>

      <h2>Moderation</h2>
      <ul>
        <li>
          Circle organisers and moderators can hide discussions and replies, and remove members from their circle.
          Anyone can report content they think breaks these rules.
        </li>
        <li>
          We can remove content and suspend accounts that break these rules or the law. If we do, we'll tell you why
          when we can, and you can reply to contest it.
        </li>
      </ul>

      <h2>The service</h2>
      <ul>
        <li>
          GawainBook is a free, early-stage service. We work hard to keep it running and your data safe, but we can't
          promise it will always be available, and features may change.
        </li>
        <li>
          We're liable without limit for intent and gross negligence and for injury to life, body or health; otherwise
          only for breaches of essential obligations and limited to typical, foreseeable damage (German law).
        </li>
        <li>If these terms change in a way that matters, we'll tell you in the app before they apply.</li>
        <li>German law applies. Mandatory consumer protection rules of your country of residence stay unaffected.</li>
      </ul>

      <h2>Contact</h2>
      <p>For questions, reports or complaints, use the contact details above or in the Impressum.</p>
    </PublicLayout>
  );
}
