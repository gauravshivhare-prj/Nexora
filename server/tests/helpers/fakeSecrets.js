/**
 * Credential-shaped values for the redaction and outbound-blocking tests.
 *
 * Every value is assembled from fragments at runtime, so no source file ever
 * holds a literal that a secret scanner — or a reader — could mistake for a
 * real credential. Each has the prefix and length the detectors look for and
 * works nowhere. Never replace these with real values.
 */

const FILLER = 'FakeTestValue0';

/** Alphanumeric padding of an exact length. */
function filler(length) {
  return FILLER.repeat(Math.ceil(length / FILLER.length)).slice(0, length);
}

const join = (...parts) => parts.join('');

export function fakeGoogleApiKey(length = 39) {
  return join('AI', 'za') + filler(length - 4);
}

export function fakeOpenAiKey(length = 35) {
  return join('sk', '-') + filler(length - 3);
}

export function fakeAnthropicKey(length = 40) {
  return join('sk', '-ant-') + filler(length - 7);
}

export function fakeGitHubToken(length = 38) {
  return join('gh', 'p_') + filler(length - 4);
}

export function fakeJwt() {
  const segment = (body) => join('ey', 'J') + body;
  return [segment(filler(20)), segment(filler(24)), filler(32)].join('.');
}

/** A URI with fake user, password and an unresolvable host. */
export function fakeCredentialedUri(scheme, path = '') {
  return join(scheme, '://', 'fake-user', ':', 'fake-pass', '@', 'db.example.invalid', path);
}

export function fakePassword() {
  return join('Fake', 'Password', '123!');
}

export function fakeSecretValue(length = 18) {
  return join('fake', 'Secret') + filler(length - 10);
}

/** A PEM private-key block with a fake body. */
export function fakePrivateKeyBlock(body) {
  const marker = join('PRIVATE', ' ', 'KEY');
  return [`-----BEGIN RSA ${marker}-----`, body, `-----END RSA ${marker}-----`].join('\n');
}
