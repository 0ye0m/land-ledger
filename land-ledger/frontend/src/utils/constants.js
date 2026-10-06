export const STATUS_LABELS = {
  PENDING_REVIEW: 'Pending review',
  SUBMITTED: 'Awaiting field survey',
  SURVEY_VERIFIED: 'Survey cleared',
  DOCS_VERIFIED: 'Docs verified',
  REGISTERED: 'Registered',
  REJECTED: 'Rejected',
  CONSENT_PENDING: 'Waiting for party consent',
  PENDING: 'Awaiting doc verification',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  VERIFIED: 'Verified',
  TAMPERED: 'Tampered',
  'HASH MISMATCH': 'Hash mismatch',
};

export const STATUS_TONES = {
  PENDING_REVIEW: 'pending',
  SUBMITTED: 'info',
  SURVEY_VERIFIED: 'primary',
  DOCS_VERIFIED: 'pending',
  CONSENT_PENDING: 'warn',
  PENDING: 'pending',
  REGISTERED: 'ok',
  APPROVED: 'ok',
  COMPLETED: 'ok',
  VERIFIED: 'ok',
  REJECTED: 'bad',
  FAILED: 'bad',
  TAMPERED: 'bad',
  'HASH MISMATCH': 'bad',
};

/** Consent board states (multi-party transfers). */
export const CONSENT_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export const CONSENT_PARTY_ROLE_LABELS = {
  SELLER: 'Owner / Seller',
  CO_OWNER: 'Co-owner',
  BUYER: 'Buyer / Proposed owner',
};

/** Registration pipeline order for the workflow tracker. */
export const REGISTRATION_STAGES = [
  { key: 'SUBMITTED', label: 'Applied', hint: 'Citizen filed the application' },
  { key: 'SURVEY_VERIFIED', label: 'Field survey', hint: 'Surveyor verified the parcel on ground' },
  { key: 'DOCS_VERIFIED', label: 'Documents', hint: 'Clerk verified the attached documents' },
  { key: 'REGISTERED', label: 'Registered', hint: 'Registrar approved and recorded on the ledger' },
];

export const RISK_TONES = { LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad' };

export const PROPERTY_TYPES = [
  { value: 'RESIDENTIAL_PLOT', label: 'Residential plot' },
  { value: 'RESIDENTIAL_BUILDING', label: 'Residential building' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'AGRICULTURAL', label: 'Agricultural' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
];

export const DOCUMENT_TYPES = [
  { value: 'TITLE_DEED', label: 'Title deed' },
  { value: 'SALE_AGREEMENT', label: 'Sale agreement' },
  { value: 'SURVEY_REPORT', label: 'Survey report' },
  { value: 'TAX_RECEIPT', label: 'Tax receipt' },
  { value: 'IDENTITY_PROOF', label: 'Identity proof' },
  { value: 'OTHER', label: 'Other' },
];

export function labelFor(value, list) {
  const found = list.find((x) => x.value === value);
  return found ? found.label : value;
}

/**
 * Demo account chips (this project shipped with demo shortcuts before MFA).
 * Chips now PREFILL the sign-in form - with email-OTP MFA active, no chip can
 * sign in by itself: the verification code goes to the account's real inbox.
 * The demo password is uniform and documented in docs/DEMO-GUIDE.md.
 */
export const DEMO_PASSWORD = 'LandLedger@123';

export const DEMO_ACCOUNTS = [
  { role: 'citizen', label: 'Om (Citizen)', email: 'mandwadeom2616@gmail.com', password: DEMO_PASSWORD },
  { role: 'citizen', label: 'Shruti (Citizen)', email: 'shrutipethe111@gmail.com', password: DEMO_PASSWORD },
  { role: 'surveyor', label: 'Akshay (Surveyor)', email: 'panpaliyaag@rknec.edu', password: DEMO_PASSWORD },
  { role: 'clerk', label: 'Nishant (Doc verifier)', email: 'tekdiwalnishant@gmail.com', password: DEMO_PASSWORD },
  { role: 'registrar', label: 'Prakash (Registrar)', email: 'omdummy101@gmail.com', password: DEMO_PASSWORD },
  { role: 'admin', label: 'Sunita (Administrator)', email: 'omdummy102@gmail.com', password: DEMO_PASSWORD },
  { role: 'citizen', label: 'Ganesh (Citizen)', email: 'alphadummy103@gmail.com', password: DEMO_PASSWORD },
  { role: 'citizen', label: 'Kavita (Citizen)', email: 'alpha20051610@gmail.com', password: DEMO_PASSWORD },
];
