export const STATUS_LABELS = {
  PENDING_REVIEW: 'Pending review',
  SUBMITTED: 'Awaiting field survey',
  SURVEY_VERIFIED: 'Survey cleared',
  DOCS_VERIFIED: 'Docs verified',
  REGISTERED: 'Registered',
  REJECTED: 'Rejected',
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

export const DEMO_ACCOUNTS = [
  { role: 'citizen', label: 'Citizen', email: 'asha.rao@example.com', password: 'Citizen@123' },
  { role: 'surveyor', label: 'Surveyor', email: 'arjun.deshmukh@landledger.gov', password: 'Surveyor@123' },
  { role: 'clerk', label: 'Doc verifier', email: 'deepa.shinde@landledger.gov', password: 'Verifier@123' },
  { role: 'registrar', label: 'Registrar', email: 'meera.krishnan@landledger.gov', password: 'Registrar@123' },
  { role: 'admin', label: 'Administrator', email: 'ramesh.iyer@landledger.gov', password: 'Admin@123' },
];
