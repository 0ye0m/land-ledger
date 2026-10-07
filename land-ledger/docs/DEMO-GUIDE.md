# LAND LEDGER — Demo Guide (MFA + Multi-Party Consent)

> Controlled university demonstration environment. Only the **8 allowlisted
> email addresses** below can hold accounts (see
> `backend/src/config/allowlist.js`). This allowlist is a deliberate demo
> constraint, **not** a production authentication strategy.

## 1. Accounts (deterministic roles — never reshuffled by reseeds)

Password for every demo account: `LandLedger@123`

| # | Name | Email | Role |
|---|------|-------|------|
| 1 | Om Mandwade | `mandwadeom2616@gmail.com` | citizen |
| 2 | Shruti Pethe | `shrutipethe111@gmail.com` | citizen |
| 3 | Akshay Panpaliya | `panpaliyaag@rknec.edu` | surveyor |
| 4 | Nishant Tekdiwal | `tekdiwalnishant@gmail.com` | clerk |
| 5 | Prakash Joshi | `omdummy101@gmail.com` | registrar |
| 6 | Sunita Deshmukh | `omdummy102@gmail.com` | admin |
| 7 | Ganesh Patil | `alphadummy103@gmail.com` | citizen |
| 8 | Kavita Sharma | `alpha20051610@gmail.com` | citizen |

## 2. Sign-in = password + email OTP (no exceptions)

1. Enter email + password → **Continue**.
2. A 6-digit code is emailed to the account's address (valid 5 minutes, single use, max 5 wrong attempts, resend cooldown 45 s).
3. Enter the code → the dashboard opens.

**Sandbox note:** until SMTP is configured (`SMTP_HOST/USER/PASSWORD` in
`backend/.env`), the sandbox runs in gated demo mode (`MFA_DEV_MODE=1` +
`NODE_ENV=development`, no SMTP): the login screen shows a clearly labelled
"Demo mode" banner with the code so the demo works without a mailbox. With
SMTP configured, codes go out by real email and the banner disappears
automatically. In production the banner can never appear.

## 3. Seeded demo data (fresh state = run `npm run seed -- --force`)

- **PROP-2026-0001** "Survey 142/2, Koregaon Park" — **co-owned**: Om (owner 60%) + Shruti (co-owner 40%). Registered on-chain to Om's wallet (blockchain keeps a single current owner; MongoDB tracks both parties). *The consent demo lives here.*
- **PROP-2026-0002** Flat 503 — Om, awaiting field survey (surveyor queue).
- **PROP-2026-0003** Khasra 88 farmland — Shruti, registered.
- **PROP-2026-0004** Shop 12 — Ganesh, at registrar legal review.
- **PROP-2026-0005** Plot 9 — Kavita, rejected (shows the rejection trail).
- **PROP-2026-0006** House 4 — Shruti, survey cleared (clerk queue).
- **PROP-2026-0007** Office 3 — Ganesh, registered.
- **PROP-2026-0008** Unit 11 — Kavita, registered.

Transfers:

| Ref | Property | Parties | State |
|-----|----------|---------|-------|
| TRF-2026-0001 | PROP-2026-0001 | Om → Ganesh, co-owner Shruti | **CONSENT_PENDING — the live demo** (Shruti + Ganesh must approve) |
| TRF-2026-0002 | PROP-2026-0003 | Shruti → Om | consent complete, at clerk desk |
| TRF-2026-0003 | PROP-2026-0007 | Ganesh → Kavita | clerk-verified, at registrar desk |
| TRF-2026-0004 | PROP-2026-0008 | Kavita → Om | CONSENT_PENDING — Om must approve (buyer) |

## 4. The demo script

1. Sign in as **Om** (citizen) — password + OTP.
2. Dashboard shows **Pending Actions**: TRF-2026-0004 where Om is the buyer (Kavita already approved). Leave it pending for now.
3. Show properties, documents (title deeds with SHA-256), the co-owned parcel.
4. Open **TRF-2026-0001** — consent board: Om approved (seller, by initiation), Shruti pending, Ganesh pending.
5. Sign out. Sign in as **Shruti** (OTP again — every sign-in).
6. Her **Pending Actions** show the co-owner consent for TRF-2026-0001 → **Approve**.
7. Board now shows 2/3 approved; transfer is still `Waiting for party consent` — **no stage advance** (server-enforced).
8. Sign in as **Ganesh** (buyer) → approve TRF-2026-0001.
9. All parties approved → status becomes `Awaiting doc verification`.
10. Sign in as **Nishant** (clerk) — queue holds House 4 + TRF-2026-0001 + TRF-2026-0002. Verify TRF-2026-0001.
11. Sign in as **Akshay** (surveyor) — verify Flat 503 in his queue.
12. Sign in as **Prakash** (registrar) — approve Flat 503 → real on-chain registration (transaction hash appears).
13. Registrar approves **TRF-2026-0001** → fraud engine re-runs → on-chain settlement → **COMPLETED** with tx hash + block number; ownership flips to Ganesh.
14. Sign in as **Sunita** (admin) — oversight board: stage counts, roster of all 5 roles, audit trail, login events (with `MFA_SUCCESS` / `LOGIN_PASSWORD_SUCCESS_MFA_REQUIRED` reasons).
15. Optional: admin override-reject any active file; try to survey as admin → 403.

Fraud/conflict engine, SHA-256 document integrity, registrar workflow and
blockchain settlement are the untouched existing systems — the consent gate
sits in front of them and blocks everything until every party agrees.

## 5. Multi-party consent rules (all server-side)

- Every associated owner/co-owner **plus the buyer** must consent explicitly.
- Any rejection → transfer REJECTED (remaining consents expire).
- All approvals → fraud revalidation → clerk document verification → registrar → blockchain.
- Consent rows are unique per (transfer, user), single-response, atomically guarded; staff endpoints return `409 CONSENT_INCOMPLETE` while consent is pending. No frontend path can bypass this.

## 6. Rebuilding a clean demo state

```bash
cd land-ledger/backend
npm run seed -- --force     # wipes + reseeds users, properties, transfers, consents
```

The seed reconciles with the running chain honestly: already-settled parcels
are skipped, drifted ones are re-pointed with real transactions. Test suites:

```bash
cd land-ledger/backend && npm test            # 44/44 (auth, MFA, consent, transfers, fraud, docs, properties)
cd land-ledger/blockchain && npx hardhat test # 20/20
node scripts/test-workflow.js                 # 56/56 E2E (after a fresh reseed)
```
