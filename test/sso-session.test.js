const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-local-secret';
process.env.SSO_REDIRECT_SIGNING_SECRET = 'test-redirect-secret';
process.env.SSO_CONTAINER_PLANNING_URL = 'https://example.org/container-planning';
process.env.SSO_CONTAINER_REGISTRATION_URL = 'https://example.org/container-registration?from=portal';

const serverModulePath = require.resolve('../server');
const { app, appendQueryParam } = require(serverModulePath);

function makeAuthToken(payload = {}) {
  return jwt.sign(
    {
      sub: '123',
      username: 'alice',
      role: 'disponent',
      permissions: ['container_planning', 'container_registration'],
      ...payload,
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  );
}

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('erlaubter Zugriff erstellt Redirect-URL mit kurzlebigem Token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sso/container-planning-session`, {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.redirectUrl, 'string');
    assert.match(body.redirectUrl, /^https:\/\/example.org\/container-planning\?/);
    assert.equal(typeof body.ssoToken, 'string');
    assert.equal(body.expiresInSeconds, 120);
  });
});

test('401 ohne Session oder Bearer', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sso/container-planning-session`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error.code, 'UNAUTHENTICATED');
  });
});

test('403 ohne passende Berechtigung', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/sso/container-registration-session`, {
      headers: { Authorization: `Bearer ${makeAuthToken({ role: 'viewer', permissions: [] })}` },
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'FORBIDDEN');
  });
});

test('500 bei fehlender Redirect-Signing-Konfiguration', async () => {
  const previous = process.env.SSO_REDIRECT_SIGNING_SECRET;
  process.env.SSO_REDIRECT_SIGNING_SECRET = '';
  delete require.cache[serverModulePath];
  const { app: appWithoutSecret } = require(serverModulePath);

  const server = appWithoutSecret.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sso/container-planning-session`, {
      headers: { Authorization: `Bearer ${makeAuthToken()}` },
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error.code, 'CONFIG_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.SSO_REDIRECT_SIGNING_SECRET = previous;
    delete require.cache[serverModulePath];
    require(serverModulePath);
  }
});

test('Query-Separator bleibt korrekt (?/&)', () => {
  assert.equal(appendQueryParam('https://example.org/path', 'ssoToken', 'abc'), 'https://example.org/path?ssoToken=abc');
  assert.equal(appendQueryParam('https://example.org/path?foo=1', 'ssoToken', 'abc'), 'https://example.org/path?foo=1&ssoToken=abc');
});
