#!/usr/bin/env python3
"""Frontend mechanical fixes batch:
A1  - registrar decision panel gate PENDING -> DOCS_VERIFIED
A3  - EmptyState renders action without actionLabel gate
A15 - dead registrarService ternary in TransferDetail
A12 - REGISTERED renders as completed (not current) in the stage rail
A10 - CONSENT_PENDING filter option in TransfersView
A14 - PropertyDetail upload uses getToken() instead of hardcoded key
A6  - global 401 handling in api.js (clear token + redirect to /login)
"""
import sys

BASE = '/home/z/my-project/land-ledger/frontend/src/'
def patch(path, old, new, tag):
    p = BASE + path
    t = open(p).read()
    if old not in t:
        print(f"SKIP ({tag}): anchor not found in {path}")
        return False
    if new in t:
        print(f"SKIP ({tag}): already applied in {path}")
        return True
    open(p, 'w').write(t.replace(old, new, 1))
    print(f"OK   ({tag}): {path}")
    return True

ok = True

# A1: registrar panel stage gate
ok &= patch('components/registry/TransferDetail.jsx',
    "{isRegistrar && transfer.status === 'PENDING' ? (",
    "{isRegistrar && transfer.status === 'DOCS_VERIFIED' ? (",
    'A1-registrar-gate')

# A15: dead ternary
ok &= patch('components/registry/TransferDetail.jsx',
    "const res = await registrarService ? await transferService.approve(transfer.id, reason.trim()) : null;",
    "const res = await transferService.approve(transfer.id, reason.trim());",
    'A15-dead-ternary')

# A3: EmptyState action gate (actionLabel no longer required)
ok &= patch('components/registry/States.jsx',
    "      {Action && actionLabel ? (",
    "      {Action ? (",
    'A3-empty-state')

# A12: REGISTERED is a completed state on the rail
ok &= patch('components/registry/PropertyDetail.jsx',
    """  const rejected = property.status === 'REJECTED';
  const currentIndex = rejected ? -1 : (STAGE_INDEX[property.status] ?? 0);""",
    """  const rejected = property.status === 'REJECTED';
  const registered = property.status === 'REGISTERED';
  const currentIndex = rejected ? -1 : (STAGE_INDEX[property.status] ?? 0);""",
    'A12-registered-flag')
ok &= patch('components/registry/PropertyDetail.jsx',
    "            const done = !rejected && i < currentIndex;",
    "            const done = registered || (!rejected && i < currentIndex);",
    'A12-registered-done')

# A10: CONSENT_PENDING in the status filter
ok &= patch('components/registry/TransfersView.jsx',
    "['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED']",
    "['CONSENT_PENDING', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED']",
    'A10-filter-option')

# A14: use exported getToken instead of the hardcoded storage key
ok &= patch('components/registry/PropertyDetail.jsx',
    "localStorage.getItem('landledger.token')",
    "getToken()",
    'A14-getToken')
ok &= patch('components/registry/PropertyDetail.jsx',
    "import { propertyService, documentService, registrarService } from '../../services';",
    "import { propertyService, documentService, registrarService } from '../../services';\nimport { getToken } from '../../services/api.js';",
    'A14-getToken-import')

# A6: global 401 handling
ok &= patch('services/api.js',
    """  if (!res.ok || (payload && payload.success === false)) {
    throw new ApiError({""",
    """  if (!res.ok || (payload && payload.success === false)) {
    // Global session-expiry handling: an expired/invalid JWT mid-session should
    // drop the stale token and return the user to sign-in, not leave every
    // page showing a dead retry loop.
    if (res.status === 401 && ['UNAUTHENTICATED', 'INVALID_TOKEN', 'USER_NOT_FOUND'].includes((payload && payload.errorCode) || '')) {
      setToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    throw new ApiError({""",
    'A6-global-401')

sys.exit(0 if ok else 1)
