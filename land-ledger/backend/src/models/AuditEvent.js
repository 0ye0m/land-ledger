'use strict';

/**
 * MongoDB collection: audit_events
 *
 * Document-shaped, append-only mirror of the PostgreSQL `audit_logs` table.
 * Written through on every auditService.record() call (best-effort).
 * Enables rich operational queries (free-text, time-window, per-actor) that a
 * document store is ideal for, and makes the registry trail browsable in
 * MongoDB Compass.
 */

const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true }, // crypto UUID
    pgId: { type: Number, default: null }, // PostgreSQL audit_logs.id (traceability between stores)
    actorId: { type: String, default: null }, // PG users.id (uuid string)
    actorName: { type: String, default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: null, index: true },
    entityId: { type: String, default: null },
    result: { type: String, enum: ['SUCCESS', 'FAILURE', 'WARN'], default: 'SUCCESS', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }, // already sanitized by callers (never credentials)
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    versionKey: false,
    collection: 'audit_events',
  }
);

auditEventSchema.index({ created_at: -1 });
auditEventSchema.index({ actorId: 1, created_at: -1 });
auditEventSchema.index({ entityType: 1, entityId: 1, created_at: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
