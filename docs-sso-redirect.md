# SSO Redirect Stabilisierung (Container Anmeldung + Container Planung)

## Root Cause
Die bisherige Weiterleitung verließ sich in mehreren Browsern auf Session-Cookies über Cross-Site-Navigation. Bei restriktiven Cookie-Policies (SameSite/Domain/secure-Mismatch) wurden diese Cookies nicht konsistent übergeben, wodurch der Ziel-Login teilweise fehlschlug.

## Neue robuste Strategie
- Die Endpunkte `/api/sso/container-planning-session` und `/api/sso/container-registration-session` erzeugen serverseitig signierte, kurzlebige Redirect-Tokens.
- Das Frontend nutzt primär `redirectUrl` aus der API-Antwort.
- Optional kann ein externer SSO-Cookie gesetzt werden, aber nur mit valider Domain/SameSite/Secure-Kombination; bei Fehlkonfiguration wird dieser Schritt ausgelassen.
- Fehlercodes sind vereinheitlicht:
  - `401` unauthenticated
  - `403` forbidden
  - `500` config/server issue

## Relevante ENV-Variablen
- `SSO_REDIRECT_SIGNING_SECRET`: Secret für Redirect-Token-Signatur.
- `SSO_REDIRECT_TOKEN_TTL_SECONDS`: Lebensdauer der Redirect-Tokens.
- `SSO_CONTAINER_PLANNING_URL`: Zielsystem URL für Container Planung.
- `SSO_CONTAINER_REGISTRATION_URL`: Zielsystem URL für Container Anmeldung.
- `AUTH_COOKIE_SAME_SITE`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_DOMAIN`: Portal-Session-Cookie-Strategie.
- `EXTERNAL_SSO_COOKIE_NAME`, `EXTERNAL_SSO_COOKIE_DOMAIN`, `EXTERNAL_SSO_COOKIE_SAME_SITE`, `EXTERNAL_SSO_COOKIE_SECURE`: optionale externe Cookie-Weitergabe.

## Beispiel-Checks
Container Planung:
```bash
curl -i -H "Authorization: Bearer <PORTAL_JWT>" \
  http://localhost:3005/api/sso/container-planning-session
```

Container Anmeldung:
```bash
curl -i -H "Authorization: Bearer <PORTAL_JWT>" \
  http://localhost:3005/api/sso/container-registration-session
```
