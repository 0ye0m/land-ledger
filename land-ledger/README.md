# LAND LEDGER

**A secure digital property registry platform** — property records, verified documents, protected ownership transfers, rule-based fraud detection, registrar review and blockchain-backed settlement in one accountable registry.

---

## 1. Product overview

Land Ledger solves the core problem of fragmented, difficult-to-verify property ownership records. It creates a structured, traceable workflow from **property registration → document verification → registrar review → ledger settlement**, producing a clear chain of ownership that citizens can trace and registrars can operate with confidence.

The product communicates trust, accountability, verification, ownership, traceability, security, document integrity and registry operations. The UI is an *institutional registry* design: warm paper backgrounds, dark navy ink, deep coral registry accent, section kickers, square registry marks, structured data tables and a subtle dotted paper texture — with a complete dark theme.

### The problem being solved

| Problem | Land Ledger answer |
| --- | --- |
| Ownership records scattered across offices | One normalized cloud registry per property |
| Documents cannot be proven unmodified | SHA-256 fingerprint at upload, re-checkable at any time |
| Duplicate/fraudulent sale attempts | Rule-based fraud & conflict engine at submission **and** decision time |
| Opaque, manipulable ownership changes | Ownership changes only via smart-contract settlement, stored with real transaction hashes |
| No accountability | Append-only audit log of every consequential action |

---

## 2. System architecture

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
          │ ers/fraud/chain/ │    └──────────────────┘   │ operator wallet     │
          │ audit (7 collec- │                           └─────────────────────┘
          │ tions, M0 free)  │
          └──────────────────┘
```

In the sandbox/integrated deployment the Express server also serves the built SPA on the same port (single origin). In Docker Compose the SPA is served by nginx which proxies `/api` and `/uploads` to the backend.

---

## 3. Feature overview

- **Public homepage** — hero, 2×2 capability grid, register → verify → settle process band, footer.
- **Authentication** — citizen self-registration, JWT sessions, bcrypt password hashing, login screen with convenient demo-account preview buttons (still real backend auth).
- **Role-based access control** — `citizen` and `registrar` roles resolved server-side from the database on every request; frontend routes guarded, API endpoints guarded again behind the UI.
- **Property registry** — searchable/filterable/paginated table, full detail page, registration workflow (PENDING_REVIEW → REGISTERED / REJECTED), registrar approve (triggers on-chain registration) / reject (reason required).
- **Document management** — upload (extension + MIME + size validation), SHA-256 fingerprint stored with metadata, integrity re-check that detects tampering, registrar formal verification, authenticated download.
- **Ownership transfers** — full workflow with ownership validation, duplicate/conflict detection, document + hash verification, rule-based fraud checks, registrar approval, on-chain settlement, real transaction hash + block stored, MongoDB updated **only after confirmation**.
- **Fraud & conflict engine** — 9 deterministic checks returning `isFraudulent / riskLevel / reasons / checksPerformed` (LOW/MEDIUM/HIGH).
- **Registrar review queue** — pending registrations + transfers, high-risk first, inspect modal with document evidence and hash checks.
- **Blockchain ledger page** — network status, contract address, latest block, transaction registry with details modal; honest "Blockchain unavailable" state.
- **Ownership history** — derived exclusively from confirmed on-chain events.
- **Audit log** — chronological event register with actor, role, action, entity, result and metadata (never credentials).
- **Profiles** — structured account record + password change; role is immutable.
- **Monitoring** — `/metrics` (Prometheus format), `/health` (DB + blockchain), Grafana dashboard provisioning.

---

## 4. Technology stack (mandated)

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, JavaScript/JSX, Tailwind CSS 3, react-router-dom 6, lucide-react |
| Backend | Node.js 20+, Express 4, REST APIs |
| Database | MongoDB Atlas (M0 free tier), Mongoose 8 ODM |
| Blockchain | Solidity 0.8.24, Hardhat 2, ethers.js v6, local Hardhat network |
| Auth | JWT (jsonwebtoken), bcrypt |
| DevOps | Docker, Docker Compose, Kubernetes manifests, Jenkinsfile |
| Monitoring | Prometheus (prom-client), Grafana |

No Next.js, no meta-frameworks, no TanStack packages — per product requirements.

---

## 5. Folder structure

```
land-ledger/
├── frontend/                 # React + Vite SPA
│   ├── src/{components,pages,layouts,routes,services,context,hooks,types,utils,assets}
│   ├── nginx.conf            # production container proxy
│   └── Dockerfile
├── backend/                  # Express REST API
│   ├── src/{controllers,routes,middleware,services,validators,utils,config}
│   ├── src/db/{pool,migrate,seed}.js
│   ├── tests/                # node:test suites (auth/property/document/transfer/fraud)
│   └── Dockerfile
├── blockchain/               # Solidity + Hardhat
│   ├── contracts/LandRegistry.sol
│   ├── scripts/deploy.js
│   ├── test/landRegistry.test.js   # 20 contract tests
│   └── deployments/local.json      # artifact consumed by the backend
├── database/
│   ├── migrations/001_init.sql
│   └── seed/ (seed logic lives in backend/src/db/seed.js)
├── k8s/                      # namespace, configmap, secrets, statefulset, deployments, ingress
├── monitoring/
│   ├── prometheus/prometheus.yml
│   └── grafana/{provisioning,dashboards}
├── scripts/
│   ├── dev-up.sh             # idempotent local bootstrap
│   └── e2e-demo-flow.js      # 31-step demonstration flow
├── docker-compose.yml
├── Jenkinsfile
├── .env.example
└── README.md
```

---

## 6. Authentication & RBAC

- `POST /api/auth/register` — citizen self-registration (server-side validation, duplicate-email handling, bcrypt cost 10).
- `POST /api/auth/login` — returns `{ token, user }`; failed attempts are audited (`USER_LOGIN_FAILED`).
- `GET /api/auth/me` — requires `Authorization: Bearer <jwt>`.

The token carries only `{ sub, role }`; **every protected request reloads the user from MongoDB**, so role changes/disabled accounts take effect immediately. `requireRole('registrar')` guards all registrar endpoints. Citizens can never approve anything, change their role, or modify chain ownership; registrars themselves remain subject to smart-contract authorization (the operator account is the only account that can mutate the registry on-chain).

**Demo accounts (seeded, allowlisted only - password login alone cannot sign in; a 6-digit email OTP is required):**

| Role | Email | Password |
| --- | --- | --- |
| Citizen | `mandwadeom2616@gmail.com` | `LandLedger@123` |
| Citizen | `shrutipethe111@gmail.com` | `LandLedger@123` |
| Surveyor | `panpaliyaag@rknec.edu` | `LandLedger@123` |
| Clerk | `tekdiwalnishant@gmail.com` | `LandLedger@123` |
| Registrar | `omdummy101@gmail.com` | `LandLedger@123` |
| Admin | `omdummy102@gmail.com` | `LandLedger@123` |
| Citizen | `alphadummy103@gmail.com` | `LandLedger@123` |
| Citizen | `alpha20051610@gmail.com` | `LandLedger@123` |

The full account/role map lives in `land-ledger/docs/DEMO-GUIDE.md`.

---

## 7. MongoDB schema

Seven collections in MongoDB Atlas (UUID string `_id`s preserving every legacy reference, indexes mirroring the old schema):

- **users** — unique email (case-insensitive index), role CHECK, wallet address.
- **properties** — unique `property_id` (`PROP-2026-0001`) + `reference_number`, owner FK, status `PENDING_REVIEW | REGISTERED | REJECTED`.
- **documents** — property FK (cascade), uploader FK, type, size, mime, storage path, `sha256_hash`, verification status `PENDING | VERIFIED | TAMPERED | HASH_MISMATCH | REJECTED`, verifier + timestamp.
- **transfer_requests** — unique `transfer_reference` (`TRF-2026-0001`), seller/buyer FKs + wallets, status `PENDING | APPROVED | REJECTED | COMPLETED | FAILED`, risk level, approval/rejection reasons.
- **fraud_checks** — transfer reference, `is_fraudulent`, `risk_level`, `reasons` + `checks_performed` subdocuments.
- **blockchain_transactions** — property/transfer references, `transaction_hash`, `block_number`, network, contract, operation `PROPERTY_REGISTER | OWNERSHIP_TRANSFER`, from/to, status `PENDING | CONFIRMED | FAILED`, error message.
- **audit_events** (+ **login_events**) — actor name/role/id, action, entity type/id, result, metadata subdocument; `login_events` adds sign-in security telemetry (IP, user agent).
- **counters** — atomic sequence generator for business ids (PROP-2026-0025, TRF-2026-0004).

References are plain string fields pointing at `_id` UUIDs (enforced at the service layer); unique indexes guarantee no duplicate emails, property ids, references or tx hashes. Bonus collections browsable in MongoDB Compass: `audit_events`, `login_events`, `counters`.

---

## 8. Document hashing

Upload flow: **React → Express (multer) → file storage → SHA-256 → MongoDB metadata/hash.**

`POST /api/documents/:id/verify-integrity` re-reads the stored bytes, recomputes SHA-256 and compares with the stored fingerprint: match → `intact: true`; mismatch → document auto-flagged `TAMPERED` + audit entry. The hash proves file integrity relative to the stored fingerprint — **it is not by itself proof of legal authenticity**; registrar verification remains part of the workflow (and is blocked for tampered files).

---

## 9. Fraud detection (rule-based, not AI)

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

## 10. Ownership transfer workflow

```
Citizen creates request
  → backend validation → ownership verification → duplicate/conflict check
  → document verification → SHA-256 verification → fraud checks
  → PENDING (registrar review)
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

## 11. Smart contract

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

## 12. REST API

All responses: `{ success, message, data }` or `{ success: false, message, errorCode }`.

| Method & path | Access | Purpose |
| --- | --- | --- |
| POST `/api/auth/register` | public | Citizen registration |
| POST `/api/auth/login` | public | Login (rate-limited) |
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
| POST `/api/documents/:id/verify` | registrar | Formal VERIFIED/REJECTED |
| GET `/api/documents/:id/download` | auth* | Authenticated download |
| POST `/api/transfers` | owner | Create transfer (fraud-gated) |
| GET `/api/transfers` | auth | Scoped list + filters |
| GET `/api/transfers/:id` | party/registrar | Detail + fraud + chain + audit |
| POST `/api/transfers/:id/approve` | registrar | Approve + settle on-chain |
| POST `/api/transfers/:id/reject` | registrar | Reject with reason |
| POST `/api/fraud/check` | owner/registrar | Pre-check engine run |
| GET `/api/fraud/:transferId` | party/registrar | Latest stored fraud check |
| GET `/api/blockchain/status` | auth | Network + contract health |
| GET `/api/blockchain/transactions` | auth | Ledger records (scoped) |
| GET `/api/blockchain/transactions/:id` | auth* | Transaction detail |
| GET `/api/registrar/dashboard` | registrar | Operational metrics |
| GET `/api/registrar/pending-properties` | registrar | Registration queue |
| GET `/api/registrar/pending-transfers` | registrar | Transfer queue (risk-ordered) |
| POST `/api/registrar/properties/:id/approve` | registrar | Approve + on-chain registration |
| POST `/api/registrar/properties/:id/reject` | registrar | Reject with reason |
| GET `/api/registrar/audit` · `/api/audit` | registrar | Audit log |
| GET `/health` | public | DB + blockchain probe |
| GET `/metrics` | internal | Prometheus metrics |

`auth*` = owner, submitter or registrar.

---

## 13. Frontend routes

Public: `/`, `/login`, `/register` · Citizen: `/citizen`, `/citizen/properties`, `/citizen/properties/register`, `/citizen/properties/:id`, `/citizen/documents`, `/citizen/transfers`, `/citizen/transfers/new`, `/citizen/transfers/:id`, `/citizen/blockchain`, `/citizen/profile` · Registrar: `/registrar`, `/registrar/properties`, `/registrar/properties/:id`, `/registrar/documents`, `/registrar/transfers`, `/registrar/transfers/:id`, `/registrar/review`, `/registrar/ledger`, `/registrar/audit`, `/registrar/profile`.

All app routes are lazy-loaded, title-managed, and guarded (`ProtectedRoute` + role redirect). Every major workflow implements loading / empty / error / success / confirmation / disabled states.

---

## 14. Environment variables

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
| `MONGODB_SERVER_SELECTION_MS` | Atlas connect timeout (default 8000) |
| `MONGODB_MAX_POOL_SIZE` | Atlas connection pool size (default 10) |
| `SEED_*` | Seeded demo credentials |

Generate a strong JWT secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

---

## 15. Local setup (bare metal)

```bash
# 0. Prerequisites: Node 20+ and a MongoDB Atlas cluster (free M0 is fine)
# 1. Install
cd backend    && npm install
cd frontend   && npm install
cd blockchain && npm install

# 2. Environment
cp .env.example backend/.env   # set MONGODB_URI (+ whitelist your IP in Atlas Network Access) + JWT_SECRET

# 3. Database (creates collections + demo data in Atlas)
cd backend && npm run seed        # add --force to wipe + reseed

# 4. Blockchain (two terminals)
cd blockchain && npx hardhat node
cd blockchain && npx hardhat run scripts/deploy.js --network localhost

# 5. API (serves the built SPA too)
cd backend && npm start          # http://localhost:3000

# 6. Frontend dev server (hot reload, proxies /api → :3000)
cd frontend && npm run dev       # http://localhost:5173
```

No local database server needed - MongoDB Atlas is cloud-hosted, so the site runs 24/7 from anywhere. Browse the data with MongoDB Compass using the same MONGODB_URI.

---

## 16. Docker

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

## 17. Kubernetes

Manifests live in `k8s/` (apply order documented in `k8s/README.md`): namespace → configmap → secrets (**fill placeholders before applying**) → blockchain → backend (2 replicas, probes) → frontend (2 replicas) → ingress → metrics scrape annotations. The database is MongoDB Atlas (set `MONGODB_URI` in the secret). Images must be built, tagged and loaded into the cluster (see README there).

---

## 18. Jenkins

`Jenkinsfile` = declarative pipeline with real stages: Checkout → Install dependencies (backend/frontend/blockchain) → Lint → **Backend tests** → **Smart contract tests** → Frontend build → Docker builds → Image validation → (gated) Deployment. Test failures fail the pipeline.

---

## 19. Prometheus & Grafana

- Backend exposes `/metrics` via prom-client: `land_ledger_http_requests_total{method,route,status}`, `land_ledger_http_request_duration_seconds{route}`, in-flight gauge, default process metrics.
- `monitoring/prometheus/prometheus.yml` scrapes `backend:3000` every 15s.
- Grafana auto-provisions the Prometheus datasource and a dashboard (`request rate`, `error rate`, `p95 latency`, `backend availability`, requests by route/method).

---

## 20. Testing

```bash
cd backend    && npm test        # 29 API tests (node:test + supertest)
cd blockchain && npx hardhat test # 20 contract tests
node scripts/e2e-demo-flow.js    # 31-step end-to-end demonstration
```

Backend suites cover auth (registration/duplicates/invalid password/protected route/RBAC), properties (creation/validation/detail/search/ownership protection), documents (upload/SHA-256/tamper detection/registrar verification/download), transfers (full happy path incl. real settlement, RBAC, non-owner, duplicate, self-transfer, unknown buyer, rejection reason), fraud engine (clean structure, seller mismatch, missing docs, cross-tenant denial). Chain-dependent tests degrade to explicit skips when Hardhat is unreachable.

---

## 21. End-to-end demonstration flow

`scripts/e2e-demo-flow.js` automates the complete spec flow: register citizens → login → create property → upload document (SHA-256) → registrar verifies document → approve property → **on-chain registration (real hash)** → citizen creates transfer → ownership/duplicate/document/hash/fraud checks → registrar approves → **on-chain ownership transfer (real hash + block)** → MongoDB updated → audit records → COMPLETED → buyer sees new ownership → ownership history shows the settlement → conflicting transfer attempt is **rejected**. Current status: **29/29 checks pass.**

---

## 22. Deployment notes

1. Create a MongoDB Atlas cluster (free M0), whitelist your server IP, set `MONGODB_URI`; run `npm run seed` for demo data.
2. Deploy the contract from a machine that can sign with the operator key; set `CONTRACT_ADDRESS`.
3. Build the frontend (`npm run build`) and serve it (Express integrated mode or the nginx container).
4. Run the API behind TLS; restrict `/metrics` to the monitoring network.
5. Use Kubernetes manifests or Docker Compose as templates; inject secrets from your secret manager.

---

## 23. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Sidebar shows “Blockchain unavailable” | Hardhat node not running or contract not deployed → `./scripts/dev-up.sh`, or start node + `--network localhost` deploy, then restart the API |
| `could not decode result data` on chain calls | Contract artifact points at an address without bytecode (fresh chain) → redeploy with `--network localhost` and restart the backend |
| `Nonce too low` during rapid approvals | Handled internally via NonceManager; if you restarted the chain, restart the backend too |
| Login 429 | Auth endpoints are rate-limited (20/min); wait a minute |
| Upload rejected | Check extension (pdf/png/jpg/jpeg/webp/doc/docx), MIME and 10MB limit |
| `operator does not exist: text = uuid` style DB errors | Always use the released schema; migrations handle casting between business IDs and UUIDs |
| Seed skipped | Data already present; use `node src/db/seed.js --force` (never in production) |

---

## 24. Security checklist status
- bcrypt password hashing (cost 10) ✓
- JWT auth with server-side user reload ✓
- Role middleware on every sensitive route ✓
- Parameterized queries everywhere (no string-built SQL from user input) ✓
- File validation: extension + MIME + size + UUID filenames ✓
- Helmet security headers, CORS, rate limiting on auth ✓
- No secrets in code — `.env` + `.env.example` only; operator key is a public Hardhat test key ✓
- No passwords/keys/credentials in logs or audit metadata ✓
- Ownership changes only after on-chain confirmation ✓
- No fabricated blockchain records, hashes, or fake functionality ✓

---

## 25. MongoDB Atlas (free M0) & MongoDB Compass

LAND LEDGER uses **two purpose-built data stores** (polyglot persistence):

| Store | Role | Data |
| --- | --- | --- |
| **MongoDB Atlas** | Primary system of record | users, properties, documents, transfer_requests, fraud_checks, blockchain_transactions, audit_events, login_events, counters |
| (Document files) | Disk storage | uploaded files live under `backend/uploads/`; metadata + SHA-256 in Atlas |

Everything runs on MongoDB Atlas — even the free M0 tier. Registry collections were
migrated 1:1 from the legacy PostgreSQL schema (UUID `_id`s, same field names, same API
shapes), so the frontend required zero changes. The event stream (`audit_events`,
`login_events`) is browsable in **MongoDB Compass**.

### 25.1 What runs in Atlas

- **`land_ledger.audit_events`** — every registry audit event (created, approved, rejected, verified, transfers, on-chain txs) written directly by the API. This is the primary audit store.
- **`land_ledger.login_events`** — every sign-in attempt (success AND failure) with email,
  role, reason, client IP and user agent. Spot credential-stuffing attempts here.

Observability: `/health` reports `mongodb: connected | disconnected`, and
`/metrics` exposes `land_ledger_mongo_writes_total`, `land_ledger_mongo_write_failures_total`
and `land_ledger_mongo_connected`. The registrar dashboard renders the live stream with an
explicit source badge.

### 25.2 Configuration

Set in `backend/.env` (or export before starting the API):

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority&appName=land-ledger
MONGODB_DB_NAME=land_ledger
```

- `MONGODB_URI` is REQUIRED (the app exits at boot in production without it).
- **Network Access (the #1 gotcha):** Atlas blocks every IP by default. In the Atlas dashboard
  go to *SECURITY → Network Access → ADD IP ADDRESS*. For a dynamic-IP dev machine use
  `0.0.0.0/0` (allow anywhere — fine for M0 demos); for production restrict it to the exact
  egress IP of the API server.
- The API connects at boot, retries in the background forever, and **auto-attaches within
  ~10–30 s once the IP is whitelisted — no restart needed**.

### 25.3 Browse the data in MongoDB Compass (free)

1. Download Compass: <https://www.mongodb.com/products/compass> (free, all platforms).
2. Open Compass → paste the **same connection string** used in `MONGODB_URI`
   (`mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/`) → *Connect*.
   (If your password contains special characters, use the URI provided by Atlas "Connect →
   Compass" which URL-encodes it for you.)
3. Open the `land_ledger` database → collections `audit_events` and `login_events`.
   Useful sample queries (filter bar):
   - Failed sign-ins: `{ "outcome": "FAILURE" }`
   - Registry approvals: `{ "action": "PROPERTY_APPROVE" }`
   - Last 24 h activity: `{ "created_at": { "$gte": ISODate(new Date(Date.now()-86400000).toISOString()) } }`

### 25.4 Free-tier notes (M0)

- 512 MB storage, shared cluster — plenty for the event stream in demo/staging.
- No serverless/backup snapshots on M0; upgrade to M10+ for backups in real production.
- Never commit the real `MONGODB_URI`; it lives in `backend/.env` (git-ignored) and, for
  Kubernetes, in `k8s/02-secrets.yaml` (REPLACE BEFORE APPLY).
