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
        password itself), your profile details, posts, photos, likes and who you follow, so the service can work
        (Art. 6(1)(b) GDPR). Signing in sets one essential cookie that keeps you signed in, and one security cookie
        that protects against forged requests. We don't use advertising or tracking cookies.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>Render (hosting of the website and server)</li>
        <li>Neon (database and photo storage, United States region)</li>
      </ul>
      <p>
        They process data only on our behalf. Where data is processed outside the EU, it's protected by the provider's
        data processing agreement and standard contractual clauses.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, have it corrected or deleted, restrict or object to its use, take it with
        you, and withdraw consent at any time without affecting earlier processing. Email the address above. You can
        also complain to a data protection authority.
      </p>
    </PublicLayout>
  );
}
