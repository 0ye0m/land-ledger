-- ============================================================
-- LAND LEDGER - initial schema (PostgreSQL 14+)
-- Normalized registry schema with UUID PKs, FKs, indexes,
-- uniqueness on user email + business property id, timestamps.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- USERS ----------
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        TEXT        NOT NULL,
    email            TEXT        NOT NULL UNIQUE,
    password_hash    TEXT        NOT NULL,
    phone            TEXT,
    district         TEXT,
    state            TEXT,
    wallet_address   TEXT,
    role             TEXT        NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'registrar')),
    last_activity_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- ---------- PROPERTIES ----------
CREATE TABLE IF NOT EXISTS properties (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         TEXT        NOT NULL UNIQUE,           -- PROP-2026-0001
    reference_number    TEXT        NOT NULL UNIQUE,           -- LL/REG/2026/000123
    title               TEXT        NOT NULL,
    address_line        TEXT        NOT NULL,
    city                TEXT        NOT NULL,
    district            TEXT        NOT NULL,
    state               TEXT        NOT NULL,
    area_value          NUMERIC(14,2) NOT NULL,
    area_unit           TEXT        NOT NULL DEFAULT 'sq ft',
    property_type       TEXT        NOT NULL CHECK (property_type IN ('RESIDENTIAL_PLOT','RESIDENTIAL_BUILDING','COMMERCIAL','AGRICULTURAL','INDUSTRIAL')),
    description         TEXT,
    submitted_by_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    current_owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    current_owner_wallet TEXT,
    status              TEXT        NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','REGISTERED','REJECTED')),
    review_notes        TEXT,
    registered_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties (status);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties (current_owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_submitter ON properties (submitted_by_id);
CREATE INDEX IF NOT EXISTS idx_properties_district ON properties (district);

-- ---------- DOCUMENTS ----------
CREATE TABLE IF NOT EXISTS documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    uploaded_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
    document_type       TEXT        NOT NULL DEFAULT 'OTHER' CHECK (document_type IN ('TITLE_DEED','SALE_AGREEMENT','SURVEY_REPORT','TAX_RECEIPT','IDENTITY_PROOF','OTHER')),
    file_name           TEXT        NOT NULL,
    file_size           INTEGER     NOT NULL,
    mime_type           TEXT,
    storage_path        TEXT        NOT NULL,
    sha256_hash         TEXT        NOT NULL,
    verification_status TEXT        NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','TAMPERED','HASH_MISMATCH','REJECTED')),
    verified_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_property ON documents (property_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (verification_status);

-- ---------- TRANSFER REQUESTS ----------
CREATE TABLE IF NOT EXISTS transfer_requests (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_reference   TEXT        NOT NULL UNIQUE,          -- TRF-2026-0001
    property_id          UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    seller_id            UUID        REFERENCES users(id) ON DELETE SET NULL,
    seller_wallet        TEXT,
    buyer_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
    buyer_wallet         TEXT,
    status               TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','COMPLETED','FAILED')),
    risk_level           TEXT        NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    request_details      TEXT,
    approval_reason      TEXT,
    rejection_reason     TEXT,
    approved_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    approved_at          TIMESTAMPTZ,
    rejected_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfers_property ON transfer_requests (property_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfer_requests (status);
CREATE INDEX IF NOT EXISTS idx_transfers_seller ON transfer_requests (seller_id);
CREATE INDEX IF NOT EXISTS idx_transfers_buyer ON transfer_requests (buyer_id);

-- ---------- FRAUD CHECKS ----------
CREATE TABLE IF NOT EXISTS fraud_checks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id      UUID        NOT NULL REFERENCES transfer_requests(id) ON DELETE CASCADE,
    is_fraudulent    BOOLEAN     NOT NULL DEFAULT FALSE,
    risk_level       TEXT        NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
    reasons          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    checks_performed JSONB       NOT NULL DEFAULT '[]'::jsonb,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_checks_transfer ON fraud_checks (transfer_id);

-- ---------- BLOCKCHAIN TRANSACTIONS ----------
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id      UUID        REFERENCES properties(id) ON DELETE SET NULL,
    transfer_id      UUID        REFERENCES transfer_requests(id) ON DELETE SET NULL,
    transaction_hash TEXT        NOT NULL,
    block_number     BIGINT,
    network          TEXT        NOT NULL DEFAULT 'hardhat',
    contract_address TEXT,
    operation        TEXT        NOT NULL CHECK (operation IN ('PROPERTY_REGISTER','OWNERSHIP_TRANSFER')),
    from_address     TEXT,
    to_address       TEXT,
    status           TEXT        NOT NULL CHECK (status IN ('PENDING','CONFIRMED','FAILED')),
    error_message    TEXT,
    timestamp        TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_btx_property ON blockchain_transactions (property_id);
CREATE INDEX IF NOT EXISTS idx_btx_transfer ON blockchain_transactions (transfer_id);
CREATE INDEX IF NOT EXISTS idx_btx_hash ON blockchain_transactions (transaction_hash);

-- ---------- AUDIT LOGS ----------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    actor_name  TEXT,
    actor_role  TEXT,
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   TEXT,
    result      TEXT        NOT NULL DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS','FAILURE')),
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','properties','documents','transfer_requests']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END $$;
