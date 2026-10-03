import { get, post } from './api';

/**
 * Build a query string, silently dropping undefined / null / empty values.
 * Raw `new URLSearchParams(params)` stringifies `undefined` into the literal
 * text "operation=undefined", which the API then treats as a real filter and
 * returns zero rows. Always build query strings through this helper.
 */
function qs(params = {}) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') clean[k] = v;
  });
  return new URLSearchParams(clean).toString();
}

export const authService = {
  register: (payload) => post('/auth/register', payload),
  login: (payload) => post('/auth/login', payload),
  me: () => get('/auth/me'),
};

export const userService = {
  profile: () => get('/users/me'),
  updateProfile: (payload) => put('/users/me', payload),
  changePassword: (payload) => post('/users/me/password', payload),
  dashboard: () => get('/users/dashboard'),
};

export const propertyService = {
  create: (payload) => post('/properties', payload),
  list: (params = {}) => get(`/properties?${qs(params)}`),
  search: (params = {}) => get(`/properties/search?${qs(params)}`),
  detail: (id) => get(`/properties/${id}`),
  update: (id, payload) => put(`/properties/${id}`, payload),
  ownershipHistory: (id) => get(`/properties/${id}/ownership-history`),
};

export const documentService = {
  list: (params = {}) => get(`/documents?${qs(params)}`),
  detail: (id) => get(`/documents/${id}`),
  verifyIntegrity: (id) => post(`/documents/${id}/verify-integrity`),
  verify: (id, outcome) => post(`/documents/${id}/verify`, { outcome }),
  downloadUrl: (id) => `/api/documents/${id}/download`,
};

export const transferService = {
  create: (payload) => post('/transfers', payload),
  list: (params = {}) => get(`/transfers?${qs(params)}`),
  detail: (id) => get(`/transfers/${id}`),
  approve: (id, reason) => post(`/transfers/${id}/approve`, { reason }),
  reject: (id, reason) => post(`/transfers/${id}/reject`, { reason }),
};

export const fraudService = {
  check: (payload) => post('/fraud/check', payload),
  forTransfer: (id) => get(`/fraud/${id}`),
};

export const blockchainService = {
  status: () => get('/blockchain/status'),
  transactions: (params = {}) => get(`/blockchain/transactions?${qs(params)}`),
  transaction: (id) => get(`/blockchain/transactions/${id}`),
};

export const registrarService = {
  dashboard: () => get('/registrar/dashboard'),
  pendingProperties: () => get('/registrar/pending-properties'),
  pendingTransfers: () => get('/registrar/pending-transfers'),
  approveProperty: (id, reason) => post(`/registrar/properties/${id}/approve`, { reason }),
  rejectProperty: (id, reason) => post(`/registrar/properties/${id}/reject`, { reason }),
  auditLogs: (params = {}) => get(`/registrar/audit?${qs(params)}`),
  activity: (params = {}) => get(`/registrar/activity?${qs(params)}`),
  loginEvents: (params = {}) => get(`/registrar/login-events?${qs(params)}`),
};

export const workflowService = {
  queue: () => get('/workflow/queue'),
  oversight: () => get('/workflow/oversight'),
  survey: (id, decision, notes) => post(`/workflow/properties/${id}/survey`, { decision, notes }),
  verifyPropertyDocs: (id, decision, notes) => post(`/workflow/properties/${id}/verify-docs`, { decision, notes }),
  verifyTransferDocs: (id, decision, notes) => post(`/workflow/transfers/${id}/verify-docs`, { decision, notes }),
  overrideRejectProperty: (id, reason) => post(`/workflow/properties/${id}/override-reject`, { reason }),
  overrideRejectTransfer: (id, reason) => post(`/workflow/transfers/${id}/override-reject`, { reason }),
};
