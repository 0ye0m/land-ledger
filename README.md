# 🏛️ LAND LEDGER

**A blockchain-backed digital property registry** — multi-party consent, surveyor field verification, clerk document scrutiny, registrar review and on-chain ownership settlement, with a full audit trail on every action.

![tests](https://img.shields.io/badge/contract_tests-20%2F20-success) ![api](https://img.shields.io/badge/API_tests-44%2F44-success) ![e2e](https://img.shields.io/badge/E2E_workflow-56%2F56-success) ![react](https://img.shields.io/badge/React-18-blue) ![node](https://img.shields.io/badge/Node-20%2B-green) ![solidity](https://img.shields.io/badge/Solidity-0.8.24-orange) ![db](https://img.shields.io/badge/MongoDB-Atlas-green) ![chain](https://img.shields.io/badge/Hardhat-2-yellow)

![LAND LEDGER — public registry landing page](land-ledger/demo/demo-screenshots/01-landing-hero.png)

---

**📖 Jump to:** [Live demo](#-live-demo) · [Verified evidence](#-verified-evidence) · [The 5-role pipeline](#-the-5-role-pipeline) · [Architecture](#-system-architecture) · [Quickstart](#-local-setup) · [API](#-rest-api) · [Smart contract](#-smart-contract)

---

## 🎬 Live demo

No public host is pinned to this README — instead the repo ships a **complete recorded demo**, so what you see is exactly what the code does:

| Asset | What it is |
| --- | --- |
| ▶️ [`land-ledger/demo/land-ledger-full-demo.mp4`](land-ledger/demo/land-ledger-full-demo.mp4) | **Full screen recording — 7 min 15 s.** Click it on GitHub and it plays right here: landing → MFA sign-in → citizen → consent → surveyor → clerk → registrar → on-chain seal → admin oversight. |
| 📕 [`land-ledger/demo/land-ledger-demo-walkthrough.pdf`](land-ledger/demo/land-ledger-demo-walkthrough.pdf) | **74-page storyboard** — all 61 screenshots in demo order with captions, run sheet and demo accounts. Present from this instead of the live app. |
| 🖼️ [`land-ledger/demo/demo-screenshots/`](land-ledger/demo/demo-screenshots) | All **61 numbered PNGs** (`01-landing-hero.png` → `61-admin-audit-log.png`) + `DEMO-GUIDE.txt` with minute-by-minute narration timestamps. |
| 🌐 [`land-ledger/demo/land-ledger-demo-walkthrough.html`](land-ledger/demo/land-ledger-demo-walkthrough.html) | Browser version of the same walkthrough. |

**Demo accounts** (all seeded — password for every account: `LandLedger@123`):

| Role | Name | Email |
| --- | --- | --- |
| Citizen | Om Mandwade | `mandwadeom2616@gmail.com` |
| Citizen | Shruti Pethe | `shrutipethe111@gmail.com` |
| Surveyor | Akshay Panpaliya | `panpaliyaag@rknec.edu` |
| Clerk | Nishant Tekdiwal | `tekdiwalnishant@gmail.com` |
| Registrar | Rohan Kulkarni | `omdummy101@gmail.com` |
| Admin | Sneha Patil | `omdummy102@gmail.com` |

> Password login alone can never sign in — every account requires a **6-digit email OTP** (two-factor) on top.

### The journey in pictures

| | |
| --- | --- |
| ![Citizen dashboard](land-ledger/demo/demo-screenshots/07-citizen-dashboard.png) | ![MFA OTP screen](land-ledger/demo/demo-screenshots/06-mfa-otp-screen.png) |
| **Citizen cockpit** — properties, transfers, ledger at a glance | **Two-factor sign-in** — password + 6-digit email OTP |
| ![Property detail](land-ledger/demo/demo-screenshots/10-property-detail-overview.png) | ![Consent board](land-ledger/demo/demo-screenshots/21-transfer-parties-consent.png) |
| **Property dossier** — ownership, timeline, documents | **Multi-party consent board** — every party must approve |
| ![Surveyor inspection](land-ledger/demo/demo-screenshots/38-surveyor-form-filled.png) | ![Clerk hash check](land-ledger/demo/demo-screenshots/43-clerk-hash-check-result.png) |
| **Surveyor field inspection** — on-ground verification record | **Clerk verification desk** — SHA-256 integrity re-check |
| ![Registrar approves](land-ledger/demo/demo-screenshots/51-registrar-registered-result.png) | ![Ledger blocks](land-ledger/demo/demo-screenshots/53-registrar-ledger-blocks.png) |
| **Registrar decision** — approval seals it on-chain | **The ledger** — real transaction hashes and blocks |
| ![Admin oversight](land-ledger/demo/demo-screenshots/59-admin-oversight-board.png) | ![Dark mode](land-ledger/demo/demo-screenshots/24-dashboard-dark-mode.png) |
| **Admin control tower** — roster, metrics, override powers | **Full dark theme** — one click, whole app morphs |

*61 more in [`land-ledger/demo/demo-screenshots/`](land-ledger/demo/demo-screenshots).*

---

## ✅ Verified evidence

Every number below is reproducible from a clean clone:

| Suite | What it proves | Command | Result |
| --- | --- | --- | --- |
| **Smart contract** | `LandRegistry.sol` — registration, ownership transfer, operator-only writes, duplicate/zero-address guards | `cd land-ledger/blockchain && npx hardhat test` | **20 passing** |
| **Backend API** | auth + MFA, RBAC, properties, documents + SHA-256 tamper detection, transfers, multi-party consent, fraud engine | `cd land-ledger/backend && node --test --test-concurrency=1` | **44 passing** |
| **Workflow E2E** | the entire 5-role pipeline against a running API — OTP sign-in, consent gate, stage guards, on-chain registration **and** settlement | `API=http://127.0.0.1:3100 node scripts/test-workflow.js` | **56/56 checks** |

**On-chain evidence** — `land-ledger/blockchain/deployments/local.json` records the deployed contract:

- Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deterministic first-deployment address)
- Deployment tx: `0xbece2ff3e7dcf5bb155622b5ddf8f15fc5175cfed2f7d9ec4b4c97e985a259ae` — a real, inspectable transaction
- Every ownership change stores its **real tx hash + block number**; MongoDB is updated only after chain confirmation. No fake hashes, ever.

---

## 1. Product overview

Land Ledger solves the core problem of fragmented, difficult-to-verify property ownership records. It creates a structured, traceable workflow from **property registration → multi-party consent → field verification → document scrutiny → registrar review → ledger settlement**, producing a clear chain of ownership that citizens can trace and registrars can operate with confidence.

The product communicates trust, accountability, verification, ownership, traceability, security, document integrity and registry operations. The UI is an *institutional registry* design: warm paper backgrounds, dark navy ink, deep coral registry accent, section kickers, square registry marks, structured data tables and a subtle dotted paper texture — with a complete dark theme.

### The problem being solved

| Problem | Land Ledger answer |
| --- | --- |
| Ownership records scattered across offices | One normalized cloud registry per property |
| Documents cannot be proven unmodified | SHA-256 fingerprint at upload, re-checkable at any time |
| Duplicate/fraudulent sale attempts | Rule-based fraud & conflict engine at submission **and** decision time |
| Deals pushed through without all parties | Multi-party consent gate — every listed party must approve before the desk sees it |
| Opaque, manipulable ownership changes | Ownership changes only via smart-contract settlement, stored with real transaction hashes |
| No accountability | Append-only audit log of every consequential action |

---

## 2. The 5-role pipeline

A transfer moves through five human desks — the API enforces who can touch what at every stage:

```
                    ┌──────────────────────────────────────────────────────┐
                    │  CONSENT_PENDING — every listed party must approve    │
                    │  (consent board, one decision each, notes optional)   │
                    └──────────────────────────┬───────────────────────────┘
                                               ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  PENDING — clerk verification desk                    │
                    │  document scrutiny + SHA-256 integrity re-checks      │
                    └──────────────────────────┬───────────────────────────┘
                                               ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  DOCS_VERIFIED — registrar review                     │
                    │  fraud gate re-runs → APPROVE or REJECT (reason req.) │
                    └──────────────────────────┬───────────────────────────┘
                                               ▼  APPROVE
                    ┌──────────────────────────────────────────────────────┐
                    │  COMPLETED — smart-contract settlement                │
                    │  real tx hash + block stored, ownership updated       │
                    └───────────────────────────────────────────────────────┘

  Surveyor runs in parallel: field inspection queue → survey record (pass/fail)
  Admin watches everything: oversight board, metrics, override-reject
```

Status model: `CONSENT_PENDING → PENDING → DOCS_VERIFIED → APPROVED → COMPLETED` (plus `REJECTED` / `FAILED` exits). A stage cannot be skipped — the API rejects out-of-order actions.

---

## 3. System architecture

```
┌────────────────────────┐        ┌─────────────────────────────┐
│  React 18 + Vite SPA   │  HTTP  │  Express REST API (:3000)   │
│  react-router-dom      │ ─────▶ │  JWT auth + RBAC middleware │
│  Tailwind design system│        │  Prometheus metrics         │
└────────────────────────┘        └──────────┬──────────────────┘
                                             │
                     ┌───────────────────────┼──────────────────────┐
                     ▼                       ▼                      ▼
          ┌──────────────────┐    ┌──────────────────┐   ┌─────────────────────┐
          │ MongoDB Atlas    │    │ Document storage │   │ Hardhat network     │
          │ users/properties │    │ filesystem +     │   │ LandRegistry.sol    │
          │ documents/trans- │    │ SHA-256 in DB    │   │ via ethers.js v6    │
          │ fers/fraud/chain/│    └──────────────────┘   │ operator wallet     │
          │ audit (7 collec- │                           └─────────────────────┘
          │ tions, M0 free)  │
          └──────────────────┘
```

In the sandbox/integrated deployment the Express server also serves the built SPA on the same port (single origin). In Docker Compose the SPA is served by nginx which proxies `/api` and `/uploads` to the backend.

---

## 4. Feature overview

- **Public homepage** — hero, 2×2 capability grid, register → verify → settle process band, footer.
- **Authentication with MFA** — citizen self-registration, bcrypt hashing, login returns an MFA **challenge** (never a token), 6-digit email OTP via `verify-otp` (rate-limited, resend endpoint), JWT issued only after the OTP. Demo preview buttons on the login screen still run the real backend flow.
- **5 roles, server-enforced** — `citizen`, `surveyor`, `clerk`, `registrar`, `admin` resolved from the database on every request; routes and endpoints double-guarded.
- **Property registry** — searchable/filterable/paginated table, full detail page, registration workflow, registrar approve (triggers on-chain registration) / reject (reason required).
- **Multi-party consent** — transfer lists its parties; each approves/rejects with an optional note on the consent board; the request only advances when all parties have consented.
- **Surveyor desk** — field-inspection queue, structured survey record (pass/fail with findings) per property.
- **Clerk desk** — verification queue, per-document scrutiny with one-click SHA-256 integrity re-check (shows match/mismatch), formal document verification.
- **Document management** — upload (extension + MIME + size validation), SHA-256 fingerprint stored with metadata, tamper detection, authenticated download.
- **Ownership transfers** — full workflow with ownership validation, duplicate/conflict detection, document + hash verification, rule-based fraud checks, registrar approval, on-chain settlement, real transaction hash + block stored, MongoDB updated **only after confirmation**.
- **Fraud & conflict engine** — 9 deterministic checks returning `isFraudulent / riskLevel / reasons / checksPerformed` (LOW/MEDIUM/HIGH).
- **Admin oversight** — cross-registry metrics, user roster, override-reject with reason.
- **Blockchain ledger page** — network status, contract address, latest block, transaction registry with details modal; honest "Blockchain unavailable" state.
- **Ownership history** — derived exclusively from confirmed on-chain events.
- **Audit log** — chronological event register with actor, role, action, entity, result and metadata (never credentials).
- **Profiles** — structured account record + password change; role is immutable.
- **Monitoring** — `/metrics` (Prometheus format), `/health` (DB + blockchain), Grafana dashboard provisioning.

---

## 5. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, JavaScript/JSX, Tailwind CSS 3, react-router-dom 6, lucide-react |
| Backend | Node.js 20+, Express 4, REST APIs |
| Database | MongoDB Atlas (M0 free tier), Mongoose 8 ODM |
| Blockchain | Solidity 0.8.24, Hardhat 2, ethers.js v6, local Hardhat network |
| Auth | JWT (jsonwebtoken), bcrypt, email OTP two-factor (Nodemailer SMTP) |
| DevOps | Docker, Docker Compose, Kubernetes manifests, Jenkinsfile |
| Monitoring | Prometheus (prom-client), Grafana |

No Next.js, no meta-frameworks, no TanStack packages — per product requirements.

---

## 6. Folder structure

```
land-ledger/
├── frontend/                 # React + Vite SPA (5 role desks)
│   ├── src/{components,pages,layouts,routes,services,context,hooks,utils}
│   ├── nginx.conf            # production container proxy
│   └── Dockerfile
├── backend/                  # Express REST API
│   ├── src/{controllers,routes,middleware,services,validators,utils,config}
│   ├── src/services/{consentService,fraudService,workflowService,...}.js
│   ├── tests/                # node:test suites (auth/consent/documents/
│   │                         #  fraud/properties/transfers) — 44 tests
│   └── Dockerfile
├── blockchain/               # Solidity + Hardhat
│   ├── contracts/LandRegistry.sol
│   ├── scripts/deploy.js
│   ├── test/landRegistry.test.js   # 20 contract tests
│   └── deployments/local.json      # artifact consumed by the backend
├── database/                 # legacy schema reference
├── docs/                     # DEMO-GUIDE.md (account/role map)
├── demo/                     # 🎬 full demo package — mp4 recording (7:15),
│                             # 74-page walkthrough PDF + HTML, 61 screenshots
├── k8s/                      # namespace, configmap, secrets, statefulset,
│                             # deployments, ingress
├── monitoring/               # prometheus.yml + grafana provisioning/dashboards
├── docker-compose.yml
└── Jenkinsfile

scripts/                      # repo-level tooling
├── test-workflow.js          # 56-check multi-role E2E (needs a running API)
├── check-demo-state.js       # audit transfers/properties/chain via the API
├── dump-state.js             # raw state dump for debugging
├── test-smtp.js              # OTP mail delivery probe
└── dev-up.sh / revive.sh     # bootstrap helpers
```

---

## 7. Authentication, MFA & RBAC

- `POST /api/auth/register` — citizen self-registration (server-side validation, duplicate-email handling, bcrypt cost 10).
- `POST /api/auth/login` — validates password, then issues an **MFA challenge** — no token is returned; failed attempts are audited.
- `POST /api/auth/verify-otp` — 6-digit code from email (rate-limited); success issues the JWT.
- `POST /api/auth/resend-otp` — re-issues a challenge code.
- `GET /api/auth/me` — requires `Authorization: Bearer <jwt>`.

The token carries only `{ sub, role }`; **every protected request reloads the user from MongoDB**, so role changes/disabled accounts take effect immediately. `requireRole(...)` guards each desk's endpoints (survey routes → surveyor only, verify-docs → clerk only, oversight/override → admin only). Citizens can never approve anything, change their role, or modify chain ownership; registrars themselves remain subject to smart-contract authorization (the operator account is the only account that can mutate the registry on-chain).

Demo accounts table: see [Live demo](#-live-demo). The full account/role map lives in `land-ledger/docs/DEMO-GUIDE.md`.

---

## 8. MongoDB schema

Seven collections in MongoDB Atlas (UUID string `_id`s preserving every legacy reference, indexes mirroring the old schema):

- **users** — unique email (case-insensitive index), role (`citizen | surveyor | clerk | registrar | admin`), wallet address.
- **properties** — unique `property_id` (`PROP-2026-0001`) + `reference_number`, owner FK, status `PENDING_REVIEW | REGISTERED | REJECTED`.
- **documents** — property FK (cascade), uploader FK, type, size, mime, storage path, `sha256_hash`, verification status `PENDING | VERIFIED | TAMPERED | HASH_MISMATCH | REJECTED`, verifier + timestamp.
- **transfer_requests** — unique `transfer_reference` (`TRF-2026-0001`), seller/buyer FKs + wallets, status `CONSENT_PENDING | PENDING | DOCS_VERIFIED | APPROVED | REJECTED | COMPLETED | FAILED`, risk level, consent records, approval/rejection reasons.
- **fraud_checks** — transfer reference, `is_fraudulent`, `risk_level`, `reasons` + `checks_performed` subdocuments.
- **blockchain_transactions** — property/transfer references, `transaction_hash`, `block_number`, network, contract, operation `PROPERTY_REGISTER | OWNERSHIP_TRANSFER`, from/to, status `PENDING | CONFIRMED | FAILED`, error message.
- **audit_events** (+ **login_events**) — actor name/role/id, action, entity type/id, result, metadata subdocument; `login_events` adds sign-in security telemetry (IP, user agent).
- **counters** — atomic sequence generator for business ids (PROP-2026-0025, TRF-2026-0004).

References are plain string fields pointing at `_id` UUIDs (enforced at the service layer); unique indexes guarantee no duplicate emails, property ids, references or tx hashes.

---

## 9. Document hashing

Upload flow: **React → Express (multer) → file storage → SHA-256 → MongoDB metadata/hash.**

`POST /api/documents/:id/verify-integrity` re-reads the stored bytes, recomputes SHA-256 and compares with the stored fingerprint: match → `intact: true`; mismatch → document auto-flagged `TAMPERED` + audit entry. The clerk desk surfaces this as a one-click check. The hash proves file integrity relative to the stored fingerprint — **it is not by itself proof of legal authenticity**; clerk/registrar verification remains part of the workflow (and is blocked for tampered files).

---

## 10. Fraud detection (rule-based, not AI)

`backend/src/services/fraudService.js` runs deterministic checks:

1. Property exists in the registry
2. Property is in a valid state for transfer
3. Requested seller is the current registered owner
4. No other active transfer request exists for the property
5. Seller and buyer are different parties
6. Property has supporting documents
7. Supporting documents pass SHA-256 integrity checks
8. Buyer wallet address is available for ledger settlement
9. Ownership has not already changed after this request

Each check returns `PASS / WARN / FAIL` with human-readable detail. `FAIL ⇒ isFraudulent + HIGH risk`; `WARN ⇒ MEDIUM`. Critical failures block transfer creation with error codes like `DUPLICATE_TRANSFER`, `SELLER_NOT_OWNER`, `PROPERTY_INVALID_STATE`. The engine re-runs at registrar decision time; a fresh fraudulent result blocks approval.

---

## 11. Ownership transfer workflow

```
Citizen creates request (all parties listed)
  → backend validation → ownership verification → duplicate/conflict check
  → document verification → SHA-256 verification → fraud checks
  → CONSENT_PENDING (consent board open; every party must decide)
  → PENDING (clerk desk: document scrutiny + hash re-checks)
  → DOCS_VERIFIED (registrar review)
Registrar
  → APPROVE  → re-run fraud gate
              → smart-contract transferOwnership() via operator wallet
              → wait 1 confirmation → real tx hash + block stored
              → MongoDB ownership update (guarded sequential writes)
              → audit records → COMPLETED
  → REJECT   → reason required, audited
Blockchain failure → ownership unchanged, transfer FAILED, failed tx recorded, error surfaced
```

**Ownership is never updated before blockchain confirmation. No fake hashes are ever produced** — a failed settlement stores the failure state instead.

---

## 12. Smart contract

`blockchain/contracts/LandRegistry.sol` (Solidity 0.8.24):

- `registerProperty(bytes32 propertyId, address owner)` — operator-only; reverts on duplicates/zero address; emits `PropertyRegistered`.
- `transferOwnership(bytes32 propertyId, address expectedCurrentOwner, address newOwner)` — operator-only; verifies the current on-chain owner matches the expected owner; emits `OwnershipTransferred`.
- `getPropertyOwner`, `verifyOwnership`, `isRegistered`, `getProperty`, `setOperator`, `propertyCount`.
- Only property identifiers and addresses live on-chain — **no citizen PII, no files**.

The business id (`PROP-2026-0001`) maps to `bytes32` via `ethers.id()` (keccak256) deterministically on both sides.

```bash
cd blockchain
npx hardhat compile
npx hardhat test                          # 20 tests
npx hardhat node                          # terminal 1
npx hardhat run scripts/deploy.js --network localhost   # terminal 2 (IMPORTANT: --network localhost)
```

The deploy writes `blockchain/deployments/local.json`; the backend reads `CONTRACT_ADDRESS` env or falls back to this artifact and verifies bytecode presence before any write (stale-artifact guard). All chain writes are serialized (NonceManager + write queue) for deterministic nonces under automine.

---

## 13. REST API

All responses: `{ success, message, data }` or `{ success: false, message, errorCode }`.

| Method & path | Access | Purpose |
| --- | --- | --- |
| POST `/api/auth/register` | public | Citizen registration |
| POST `/api/auth/login` | public | Password step → MFA challenge (rate-limited) |
| POST `/api/auth/verify-otp` | challenge | OTP step → JWT (rate-limited) |
| POST `/api/auth/resend-otp` | challenge | Re-issue OTP |
| GET `/api/auth/me` | auth | Current session |
| GET `/api/users/me` · PUT `/api/users/me` | auth | Profile read/update |
| PUT `/api/users/me/password` | auth | Password change |
| GET `/api/users/dashboard` | auth | Citizen overview metrics |
| POST `/api/properties` | auth | Submit registration (PENDING_REVIEW) |
| GET `/api/properties` | auth | Scoped list + filters + pagination |
| GET `/api/properties/search` | auth | Search alias |
| GET `/api/properties/:id` | auth* | Full record + docs + transfers + chain |
| GET `/api/properties/:id/ownership-history` | auth* | On-chain ownership history |
| PUT `/api/properties/:id` | owner/registrar | Edit while pending |
| POST `/api/documents/upload` | owner/registrar | Multipart upload + SHA-256 |
| GET `/api/documents` | auth | Scoped document registry |
| GET `/api/documents/:id` | auth* | Document detail |
| POST `/api/documents/:id/verify-integrity` | auth* | Re-hash + compare |
| POST `/api/documents/:id/verify` | clerk/registrar | Formal VERIFIED/REJECTED |
| GET `/api/documents/:id/download` | auth* | Authenticated download |
| POST `/api/transfers` | owner | Create transfer (fraud-gated) |
| GET `/api/transfers` | auth | Scoped list + filters |
| GET `/api/transfers/:id` | party/registrar | Detail + fraud + chain + audit |
| POST `/api/transfers/:id/approve` | registrar | Approve + settle on-chain |
| POST `/api/transfers/:id/reject` | registrar | Reject with reason |
| GET `/api/consents/pending` | party | My open consent decisions |
| GET `/api/consents/transfer/:id` | party/registrar | Consent board for a transfer |
| POST `/api/consents/:consentId/decision` | party | Approve/reject with optional note |
| POST `/api/fraud/check` | owner/registrar | Pre-check engine run |
| GET `/api/fraud/:transferId` | party/registrar | Latest stored fraud check |
| GET `/api/workflow/queue` | surveyor/clerk/registrar/admin | Role-aware work queue |
| POST `/api/workflow/properties/:id/survey` | surveyor | Field inspection record (pass/fail) |
| POST `/api/workflow/properties/:id/verify-docs` | clerk | Property document scrutiny |
| POST `/api/workflow/transfers/:id/verify-docs` | clerk | Transfer document scrutiny |
| GET `/api/workflow/oversight` | admin | Cross-registry metrics + roster |
| POST `/api/workflow/properties/:id/override-reject` | admin | Admin override (reason required) |
| POST `/api/workflow/transfers/:id/override-reject` | admin | Admin override (reason required) |
| GET `/api/blockchain/status` | auth | Network + contract health |
| GET `/api/blockchain/transactions` | auth | Ledger records (scoped) |
| GET `/api/blockchain/transactions/:id` | auth* | Transaction detail |
| GET `/api/registrar/dashboard` | registrar | Operational metrics |
| GET `/api/registrar/pending-properties` | registrar | Registration queue |
| GET `/api/registrar/pending-transfers` | registrar | Transfer queue (risk-ordered) |
| POST `/api/registrar/properties/:id/approve` | registrar | Approve + on-chain registration |
| POST `/api/registrar/properties/:id/reject` | registrar | Reject with reason |
| GET `/api/registrar/audit` · `/api/audit` | registrar/admin | Audit log |
| GET `/health` | public | DB + blockchain probe |
| GET `/metrics` | internal | Prometheus metrics |

`auth*` = owner, submitter or registrar.

---

## 14. Frontend routes

Public: `/`, `/login`, `/register` · Citizen: `/citizen`, `/citizen/properties`, `/citizen/properties/register`, `/citizen/properties/:id`, `/citizen/documents`, `/citizen/transfers`, `/citizen/transfers/new`, `/citizen/transfers/:id`, `/citizen/blockchain`, `/citizen/profile` · Surveyor: `/surveyor` (queue + property inspection) · Clerk: `/clerk` (verification desk) · Registrar: `/registrar`, `/registrar/properties`, `/registrar/properties/:id`, `/registrar/documents`, `/registrar/transfers`, `/registrar/transfers/:id`, `/registrar/review`, `/registrar/ledger`, `/registrar/audit`, `/registrar/profile` · Admin: `/admin` (oversight board, roster, metrics).

All app routes are lazy-loaded, title-managed, and guarded (`ProtectedRoute` + role redirect). Every major workflow implements loading / empty / error / success / confirmation / disabled states.

---

## 15. Environment variables

Copy `.env.example` → `.env` (root) and/or `backend/.env`. **Never commit real secrets.**

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 3000) |
| `CORS_ORIGIN` | Allowed browser origins |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing |
| `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`, `ALLOWED_DOC_EXTENSIONS` | Upload policy |
| `BLOCKCHAIN_RPC_URL` | Hardhat RPC (default `http://127.0.0.1:8545`) |
| `BLOCKCHAIN_OPERATOR_PRIVATE_KEY` | Operator signer (Hardhat key #0 in dev — never a funded key) |
| `CONTRACT_ADDRESS` | Overrides the deployment artifact |
| `MONGODB_URI` | MongoDB Atlas connection string (optional — empty disables MongoDB) |
| `MONGODB_DB_NAME` | Atlas database name (default `land_ledger`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | OTP email delivery |
| `MFA_DEV_MODE` | Exposes `devCode` in the challenge response (sandbox/demo only) |
| `SEED_*` | Seeded demo credentials |

Generate a strong JWT secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

---

## 16. Local setup (bare metal)

```bash
# 0. Prerequisites: Node 20+ and a MongoDB Atlas cluster (free M0 is fine)
# 1. Install
cd land-ledger/backend    && npm install
cd land-ledger/frontend   && npm install
cd land-ledger/blockchain && npm install

# 2. Environment
cp land-ledger/.env.example land-ledger/backend/.env   # set MONGODB_URI
                                                       # (+ whitelist your IP in Atlas Network Access) + JWT_SECRET

# 3. Database (creates collections + demo data in Atlas)
cd land-ledger/backend && npm run seed        # add --force to wipe + reseed

# 4. Blockchain (two terminals)
cd land-ledger/blockchain && npx hardhat node
cd land-ledger/blockchain && npx hardhat run scripts/deploy.js --network localhost

# 5. API (serves the built SPA too)
cd land-ledger/backend && npm start          # http://localhost:3000

# 6. Frontend dev server (hot reload, proxies /api → :3000)
cd land-ledger/frontend && npm run dev       # http://localhost:5173
```

No local database server needed — MongoDB Atlas is cloud-hosted, so the site runs 24/7 from anywhere. Browse the data with MongoDB Compass using the same MONGODB_URI.

---

## 17. Docker

```bash
export MONGODB_URI="mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
docker compose up --build
# frontend  → http://localhost:8080
# backend   → http://localhost:3000 (API + /metrics)
# hardhat   → localhost:8545
# prometheus→ http://localhost:9090
# grafana   → http://localhost:3001 (admin / ${GRAFANA_PASSWORD:-admin})
```

Backend and frontend images are multi-stage builds with non-root runtime users and health checks. After the stack is up, deploy the contract once: `docker compose exec blockchain npx hardhat run scripts/deploy.js --network localhost`.

---

## 18. Kubernetes

Manifests live in `land-ledger/k8s/` (apply order documented there): namespace → configmap → secrets (**fill placeholders before applying**) → blockchain → backend (2 replicas, probes) → frontend (2 replicas) → ingress → metrics scrape annotations. The database is MongoDB Atlas (set `MONGODB_URI` in the secret). Images must be built, tagged and loaded into the cluster.

---

## 19. Jenkins

`land-ledger/Jenkinsfile` = declarative pipeline with real stages: Checkout → Install dependencies (backend/frontend/blockchain) → Lint → **Backend tests** → **Smart contract tests** → Frontend build → Docker builds → Image validation → (gated) Deployment. Test failures fail the pipeline.

---

## 20. Prometheus & Grafana

- Backend exposes `/metrics` via prom-client: `land_ledger_http_requests_total{method,route,status}`, `land_ledger_http_request_duration_seconds{route}`, in-flight gauge, default process metrics.
- `monitoring/prometheus/prometheus.yml` scrapes `backend:3000` every 15s.
- Grafana auto-provisions the Prometheus datasource and a dashboard (`request rate`, `error rate`, `p95 latency`, `backend availability`, requests by route/method).

---

## 21. Running the test suites (evidence, reproducible)

```bash
# 1. Smart contract — 20 tests
cd land-ledger/blockchain && npx hardhat test

# 2. Backend API — 44 tests across 6 suites (auth, consent, documents,
#    fraud, properties, transfers)
cd land-ledger/backend && node --test --test-concurrency=1

# 3. Workflow E2E — 56 checks against a running API (full 5-role pipeline
#    incl. OTP sign-in, consent gate and on-chain settlement)
cd land-ledger/backend && npm run seed -- --force   # pristine demo state
cd land-ledger/backend && npm start                 # terminal 1 (port 3000)
API=http://127.0.0.1:3000 node scripts/test-workflow.js   # repo root
```

Backend suites cover auth (registration/duplicates/MFA challenge flow/protected routes/RBAC), consent (multi-party decisions, stage guards), documents (upload/SHA-256/tamper detection/verification/download), transfers (full happy path incl. real settlement, RBAC, non-owner, duplicate, self-transfer, unknown buyer, rejection reason), fraud engine (clean structure, seller mismatch, missing docs, cross-tenant denial). Chain-dependent tests degrade to explicit skips when Hardhat is unreachable.

---

## 22. Deployment notes

1. Create a MongoDB Atlas cluster (free M0), whitelist your server IP, set `MONGODB_URI`; run `npm run seed` for demo data.
2. Configure SMTP for OTP email (`SMTP_*` vars) — the demo mode `MFA_DEV_MODE=1` shows codes in the API response instead.
3. Deploy the contract from a machine that can sign with the operator key; set `CONTRACT_ADDRESS`.
4. Build the frontend (`npm run build`) and serve it (Express integrated mode or the nginx container).
5. Run the API behind TLS; restrict `/metrics` to the monitoring network.
6. Use Kubernetes manifests or Docker Compose as templates; inject secrets from your secret manager.

---

## 23. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Sidebar shows "Blockchain unavailable" | Hardhat node not running or contract not deployed → start node + `--network localhost` deploy, then restart the API |
| `could not decode result data` on chain calls | Contract artifact points at an address without bytecode (fresh chain) → redeploy with `--network localhost` and restart the backend |
| `Nonce too low` during rapid approvals | Handled internally via NonceManager; if you restarted the chain, restart the backend too |
| Login 429 | Auth endpoints are rate-limited (20/min); wait a minute |
| OTP email never arrives | Check SMTP config (`node scripts/test-smtp.js` probes delivery); in demo mode set `MFA_DEV_MODE=1` |
| Transfer stuck in CONSENT_PENDING | That's the consent gate — every listed party must decide on the consent board |
| Upload rejected | Check extension (pdf/png/jpg/jpeg/webp/doc/docx), MIME and 10MB limit |
| Seed skipped | Data already present; use `npm run seed -- --force` (never in production) |

---

## 24. Security checklist status

- bcrypt password hashing (cost 10) ✓
- Two-factor sign-in: password + 6-digit email OTP; no token before OTP ✓
- JWT auth with server-side user reload ✓
- Role middleware on every sensitive route (5 roles) ✓
- File validation: extension + MIME + size + UUID filenames ✓
- Helmet security headers, CORS, rate limiting on auth + OTP ✓
- No secrets in code — `.env` + `.env.example` only; operator key is a public Hardhat test key ✓
- No passwords/keys/credentials in logs or audit metadata ✓
- Multi-party consent enforced server-side before desk review ✓
- Ownership changes only after on-chain confirmation ✓
- No fabricated blockchain records, hashes, or fake functionality ✓

---

## 25. MongoDB Atlas (free M0) & MongoDB Compass

LAND LEDGER uses **two purpose-built data stores** (polyglot persistence):

| Store | Role | Data |
| --- | --- | --- |
| **MongoDB Atlas** | Primary system of record | users, properties, documents, transfer_requests, fraud_checks, blockchain_transactions, audit_events, login_events, counters |
| (Document files) | Disk storage | uploaded files live under `backend/uploads/`; metadata + SHA-256 in Atlas |

Everything runs on MongoDB Atlas — even the free M0 tier. The event stream (`audit_events`, `login_events`) is browsable in **MongoDB Compass**.

### 25.1 What runs in Atlas

- **`land_ledger.audit_events`** — every registry audit event (created, approved, rejected, verified, consents, transfers, on-chain txs) written directly by the API.
- **`land_ledger.login_events`** — every sign-in attempt (success AND failure) with email, role, reason, client IP and user agent. Spot credential-stuffing attempts here.

Observability: `/health` reports `mongodb: connected | disconnected`, and `/metrics` exposes `land_ledger_mongo_writes_total`, `land_ledger_mongo_write_failures_total` and `land_ledger_mongo_connected`.

### 25.2 Configuration

Set in `backend/.env` (or export before starting the API):

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority&appName=land-ledger
MONGODB_DB_NAME=land_ledger
```

- `MONGODB_URI` is REQUIRED (the app exits at boot in production without it).
- **Network Access (the #1 gotcha):** Atlas blocks every IP by default. In the Atlas dashboard go to *SECURITY → Network Access → ADD IP ADDRESS*. For a dynamic-IP dev machine use `0.0.0.0/0` (fine for M0 demos); for production restrict it to the exact egress IP of the API server.
- The API connects at boot, retries in the background forever, and **auto-attaches within ~10–30 s once the IP is whitelisted — no restart needed**.

### 25.3 Free-tier notes (M0)

- 512 MB storage, shared cluster — plenty for the event stream in demo/staging.
- No serverless/backup snapshots on M0; upgrade to M10+ for backups in real production.
- Never commit the real `MONGODB_URI`; it lives in `backend/.env` (git-ignored) and, for Kubernetes, in `k8s/02-secrets.yaml` (REPLACE BEFORE APPLY).
