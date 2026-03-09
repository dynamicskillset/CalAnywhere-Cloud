![CalAnywhere logo](https://github.com/dynamicskillset/CalAnywhere/blob/main/calanywhere.jpg?raw=true)

## CalAnywhere

Privacy-first scheduling for any calendar. No OAuth. No email collection. No passwords. iCal URLs only.

Live at **[scheduler.dougbelshaw.com](https://scheduler.dougbelshaw.com)**.

### What it does

CalAnywhere creates scheduling pages that show only when you are free, not the details of your events. Anyone with an iCal feed — Google, Outlook, Proton, Apple, Fastmail — can use it. Visitors request a time, you get notified, that is it.

Key properties:

- **Email-free auth** — Emoji ID (3-emoji handle) + iCal URL as possession factor. No passwords, no OAuth
- **Pages expire** — each page has a configurable expiry. When it expires, visitors see a clear message. Your calendar details are never stored
- **Anti-Big Tech** — works with any calendar provider. No lock-in by design

### Architecture

```
backend/          # Express + TypeScript API (AGPL-3.0)
  src/auth/       # Emoji ID authentication
  src/routes/     # Pages, dashboard, admin API
  src/db/         # PostgreSQL, migrations
frontend/         # React + Vite + TypeScript UI (AGPL-3.0)
  src/pages/      # Signup, signin, dashboard, scheduling, admin
  src/components/ # NavBar, shared UI
cloud/            # Reserved for future Stripe billing
```

### Running locally

```bash
cp backend/.env.example backend/.env
# edit backend/.env with your values
docker compose up --build
```

The app will be available at `http://localhost`. Mailgun is optional — emails are logged to the console when the env vars are absent.

### Admin

An admin dashboard is available at `/admin/login`. Set credentials via env vars:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password-here
```

The admin dashboard shows basic stats and a toggle to enable or disable new signups.

### Releases

| Version | Date | Summary |
|---------|------|---------|
| [1.0.2](CHANGELOG.md#102--2026-03-09) | 2026-03-09 | Admin dashboard, AGPL-3.0 relicensing, repo consolidation |
| [1.0.1](CHANGELOG.md#101--2026-03-09) | 2026-03-09 | Configurable availability hours and timezone with DST support |
| [1.0.0](CHANGELOG.md#100--2026-03-05) | 2026-03-05 | First release — auth, dashboard, page ownership, production deploy |

See [CHANGELOG.md](CHANGELOG.md) for full details.

### Licence

[GNU Affero General Public License v3.0](LICENSE) — see LICENSE for full terms.

---

Built by [Dynamic Skillset](https://dynamicskillset.com).
