'use strict';

const mongoose = require('mongoose');

/**
 * MongoDB document model: counters
 * Atomic sequence generator for business ids (PROP-2026-0001, TRF-2026-0001,
 * LL/REG/2026/000123). findOneAndUpdate + $inc is atomic, so two concurrent
 * creations can never mint the same reference (stronger than the legacy
 * COUNT(*)-based approach).
 */

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  {
    versionKey: false,
    collection: 'counters',
  }
);

/** Atomically increment and return the next sequence number for `key`. */
counterSchema.statics.nextSeq = async function nextSeq(key) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return doc.seq;
};

/** Set a counter to a floor value (never lowers it) - used by the migrator/seeder. */
counterSchema.statics.ensureFloor = async function ensureFloor(key, minSeq) {
  await this.updateOne(
    { _id: key, seq: { $lt: minSeq } },
    { $set: { seq: minSeq } }
  );
  await this.updateOne(
    { _id: key },
    { $setOnInsert: { seq: minSeq } },
    { upsert: true }
  );
};

module.exports = mongoose.model('Counter', counterSchema);
