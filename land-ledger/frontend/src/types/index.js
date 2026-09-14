/**
 * JSDoc type definitions for Land Ledger domain objects.
 * (Plain JavaScript project - these document the API contract for IDEs.)
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} fullName
 * @property {string} email
 * @property {string} phone
 * @property {string} district
 * @property {string} state
 * @property {'citizen'|'registrar'} role
 * @property {string|null} walletAddress
 * @property {string} createdAt
 * @property {string|null} lastActivityAt
 *
 * @typedef {Object} Property
 * @property {string} id
 * @property {string} property_id        - PROP-2026-0001
 * @property {string} reference_number   - LL/REG/2026/100001
 * @property {string} title
 * @property {string} address_line
 * @property {string} city
 * @property {string} district
 * @property {string} state
 * @property {number} area_value
 * @property {string} area_unit
 * @property {string} property_type
 * @property {string} description
 * @property {string|null} current_owner_id
 * @property {string|null} current_owner_wallet
 * @property {'PENDING_REVIEW'|'REGISTERED'|'REJECTED'} status
 * @property {string} created_at
 * @property {string} updated_at
 *
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} property_id
 * @property {string} uploaded_by
 * @property {string} document_type
 * @property {string} file_name
 * @property {number} file_size
 * @property {string} mime_type
 * @property {string} storage_path
 * @property {string} sha256_hash
 * @property {'PENDING'|'VERIFIED'|'TAMPERED'|'HASH_MISMATCH'|'REJECTED'} verification_status
 * @property {string|null} verified_by
 * @property {string|null} verified_at
 *
 * @typedef {Object} Transfer
 * @property {string} id
 * @property {string} transfer_reference - TRF-2026-0001
 * @property {string} property_id
 * @property {string} seller_id
 * @property {string|null} seller_wallet
 * @property {string} buyer_id
 * @property {string|null} buyer_wallet
 * @property {'PENDING'|'APPROVED'|'REJECTED'|'COMPLETED'|'FAILED'} status
 * @property {'LOW'|'MEDIUM'|'HIGH'} risk_level
 * @property {string|null} request_details
 * @property {string|null} approval_reason
 * @property {string|null} rejection_reason
 * @property {string|null} approved_by
 * @property {string|null} approved_at
 *
 * @typedef {Object} FraudCheck
 * @property {string} id
 * @property {string} transfer_id
 * @property {boolean} is_fraudulent
 * @property {'LOW'|'MEDIUM'|'HIGH'} risk_level
 * @property {string[]} reasons
 * @property {{check:string,label:string,status:'PASS'|'WARN'|'FAIL',detail:string}[]} checks_performed
 *
 * @typedef {Object} BlockchainTransaction
 * @property {string} id
 * @property {string|null} property_id
 * @property {string|null} transfer_id
 * @property {string} transaction_hash
 * @property {number|null} block_number
 * @property {string} network
 * @property {string|null} contract_address
 * @property {'PROPERTY_REGISTER'|'OWNERSHIP_TRANSFER'} operation
 * @property {string|null} from_address
 * @property {string|null} to_address
 * @property {'PENDING'|'CONFIRMED'|'FAILED'} status
 * @property {string|null} timestamp
 *
 * @typedef {Object} AuditLog
 * @property {string} id
 * @property {string|null} actor_id
 * @property {string} actor_name
 * @property {string} actor_role
 * @property {string} action
 * @property {string} entity_type
 * @property {string|null} entity_id
 * @property {'SUCCESS'|'FAILURE'} result
 * @property {Object|null} metadata
 */

export {};
