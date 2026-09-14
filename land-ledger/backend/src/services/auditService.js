'use strict';

const AuditEvent = require('../models/AuditEvent');
const User = require('../models/User');
const { caseInsensitive } = require('../db/rows');
const logger = require('../utils/logger');

/**
 * Append an audit event (MongoDB `audit_events` - the primary audit store).
 * Never log passwords, JWT secrets, private keys or credentials - metadata
 * must already be sanitized by the caller.
 *
 * Failures are logged, never thrown: auditing must not break the workflow.
 */
async function record({ actor = null, action, entityType, entityId = null, result = 'SUCCESS', metadata = null }) {
  try {
    await AuditEvent.create({
      eventId: require('crypto').randomUUID(),
      actorId: actor && actor.id ? String(actor.id) : null,
      actorName: actor && actor.full_name ? actor.full_name : 'system',
      actorRole: actor && actor.role ? actor.role : 'system',
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      result,
      metadata,
      created_at: new Date(),
    });
  } catch (err) {
    logger.error(`[audit] failed to record ${action}: ${err.message}`);
  }
}

/**
 * List audit events with filters + pagination (registrar only endpoint).
 * Returns rows in the exact legacy shape (id, actor_name, ..., actor_email).
 */
async function listLogs({ page = 1, pageSize = 25, action = null, entityType = null, actorId = null }) {
  const filter = {};
  if (action) filter.action = caseInsensitive(action);
  if (entityType) filter.entityType = entityType;
  if (actorId) filter.actorId = actorId;

  const total = await AuditEvent.countDocuments(filter);
  const docs = await AuditEvent.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  // Resolve actor emails in one query (legacy rows carried actor_email via JOIN).
  const actorIds = [...new Set(docs.map((d) => d.actorId).filter(Boolean))];
  const userDocs = actorIds.length ? await User.find({ _id: { $in: actorIds } }).select('email').lean() : [];
  const emailById = Object.fromEntries(userDocs.map((u) => [u._id, u.email]));

  const logs = docs.map((d) => ({
    id: d.eventId || String(d._id),
    actor_id: d.actorId || null,
    actor_name: d.actorName || 'system',
    actor_role: d.actorRole || 'system',
    action: d.action,
    entity_type: d.entityType,
    entity_id: d.entityId,
    result: d.result,
    metadata: d.metadata ?? null,
    created_at: d.created_at,
    actor_email: (d.actorId && emailById[d.actorId]) || null,
  }));

  return { total, page, pageSize, logs };
}

/** Audit trail for one entity (used by transfer detail). Legacy row shape. */
async function trailForEntity({ entityType, entityId, limit = 50 }) {
  const docs = await AuditEvent.find({ entityType, entityId: String(entityId) })
    .sort({ created_at: 1 })
    .limit(limit)
    .lean();
  const actorIds = [...new Set(docs.map((d) => d.actorId).filter(Boolean))];
  const userDocs = actorIds.length ? await User.find({ _id: { $in: actorIds } }).select('full_name').lean() : [];
  const nameById = Object.fromEntries(userDocs.map((u) => [u._id, u.full_name]));
  return docs.map((d) => ({
    id: d.eventId || String(d._id),
    actor_id: d.actorId || null,
    actor_name: d.actorName || 'system',
    actor_role: d.actorRole || 'system',
    action: d.action,
    entity_type: d.entityType,
    entity_id: d.entityId,
    result: d.result,
    metadata: d.metadata ?? null,
    created_at: d.created_at,
    actor_display: (d.actorId && nameById[d.actorId]) || d.actorName || 'system',
  }));
}

module.exports = { record, listLogs, trailForEntity };
