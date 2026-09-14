'use strict';

/** Lightweight, dependency-free request validation helpers. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^.{8,128}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const PHONE_RE = /^[+\d][\d\s-]{6,18}$/;

function validateRegister(body) {
  const errors = {};
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const phone = String(body.phone || '').trim();
  const district = String(body.district || '').trim();
  const state = String(body.state || '').trim();
  const walletAddress = String(body.walletAddress || '').trim();

  if (fullName.length < 3 || fullName.length > 120) errors.fullName = 'Full name must be between 3 and 120 characters';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (!PASSWORD_RE.test(password)) errors.password = 'Use at least 8 characters';
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a valid phone number';
  if (!district) errors.district = 'District is required';
  if (!state) errors.state = 'State is required';
  if (walletAddress && !WALLET_RE.test(walletAddress)) errors.walletAddress = 'Wallet address must be a valid 0x address';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { fullName, email, password, phone, district, state, walletAddress: walletAddress || null },
  };
}

function validateLogin(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const errors = {};
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return { valid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

const PROPERTY_TYPES = ['RESIDENTIAL_PLOT', 'RESIDENTIAL_BUILDING', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL'];

function validateProperty(body) {
  const errors = {};
  const value = {
    title: String(body.title || '').trim(),
    addressLine: String(body.addressLine || '').trim(),
    city: String(body.city || '').trim(),
    district: String(body.district || '').trim(),
    state: String(body.state || '').trim(),
    areaValue: parseFloat(body.areaValue),
    areaUnit: String(body.areaUnit || 'sq ft').trim(),
    propertyType: String(body.propertyType || '').trim(),
    description: String(body.description || '').trim(),
    ownerWallet: String(body.ownerWallet || '').trim() || null,
  };

  if (value.title.length < 3 || value.title.length > 160) errors.title = 'Property reference/title must be 3-160 characters';
  if (!value.addressLine) errors.addressLine = 'Address is required';
  if (!value.city) errors.city = 'City is required';
  if (!value.district) errors.district = 'District is required';
  if (!value.state) errors.state = 'State is required';
  if (!Number.isFinite(value.areaValue) || value.areaValue <= 0) errors.areaValue = 'Area must be a positive number';
  if (!PROPERTY_TYPES.includes(value.propertyType)) errors.propertyType = `Property type must be one of: ${PROPERTY_TYPES.join(', ')}`;
  if (value.ownerWallet && !WALLET_RE.test(value.ownerWallet)) errors.ownerWallet = 'Wallet address must be a valid 0x address';
  if (value.description.length > 2000) errors.description = 'Description must be under 2000 characters';

  return { valid: Object.keys(errors).length === 0, errors, value };
}

function validateTransfer(body) {
  const errors = {};
  const value = {
    propertyId: String(body.propertyId || '').trim(),
    buyerEmail: String(body.buyerEmail || '').trim().toLowerCase(),
    requestDetails: String(body.requestDetails || '').trim(),
  };
  if (!value.propertyId) errors.propertyId = 'Property is required';
  if (!EMAIL_RE.test(value.buyerEmail)) errors.buyerEmail = 'Enter the buyer\'s registered email address';
  if (value.requestDetails.length > 2000) errors.requestDetails = 'Details must be under 2000 characters';
  return { valid: Object.keys(errors).length === 0, errors, value };
}

module.exports = { validateRegister, validateLogin, validateProperty, validateTransfer, PROPERTY_TYPES, WALLET_RE };
