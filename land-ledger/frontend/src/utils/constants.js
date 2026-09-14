export const STATUS_LABELS = {
  PENDING_REVIEW: 'Pending review',
  REGISTERED: 'Registered',
  REJECTED: 'Rejected',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  VERIFIED: 'Verified',
  TAMPERED: 'Tampered',
  'HASH MISMATCH': 'Hash mismatch',
};

export const STATUS_TONES = {
  PENDING_REVIEW: 'pending',
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

export const DEMO_ACCOUNTS = {
  citizen: { email: 'asha.rao@example.com', password: 'Citizen@123' },
  registrar: { email: 'meera.krishnan@landledger.gov', password: 'Registrar@123' },
};
