"use strict";

/**
 * LandRegistry test suite.
 *
 * Covers the full product spec: property registration, duplicate protection,
 * owner retrieval, ownership verification, ownership transfer (including the
 * expected-owner provenance check), access control, operator rotation and
 * event emission with exact arguments.
 *
 * Runs on the in-process Hardhat network; loadFixture snapshots keep every
 * test isolated and fast.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Revert messages asserted by this suite (kept in sync with LandRegistry.sol).
const REVERT = {
  NOT_REGISTERED: "LandRegistry: property not registered",
  ALREADY_REGISTERED: "LandRegistry: property already registered",
  ZERO_OWNER: "LandRegistry: owner is zero address",
  ZERO_NEW_OWNER: "LandRegistry: new owner is zero address",
  // \u2014 is the em dash used in the contract's provenance-mismatch message.
  PROVENANCE_MISMATCH:
    "LandRegistry: caller provenance mismatch \u2014 current owner does not match expected owner",
  SAME_OWNER: "LandRegistry: new owner equals current owner",
  NOT_OPERATOR: "LandRegistry: caller is not the operator",
  ZERO_OPERATOR: "LandRegistry: operator is zero address",
};

/**
 * Fresh contract with an empty registry.
 * - `operator`: deployer / backend service wallet (the contract operator).
 * - `citizen`, `newOwner`: citizen wallets acting as property owners.
 * - `intruder`: unauthorized account used for access-control checks.
 */
async function deployLandRegistryFixture() {
  const [operator, citizen, newOwner, intruder] = await ethers.getSigners();

  const LandRegistry = await ethers.getContractFactory("LandRegistry", operator);
  const landRegistry = await LandRegistry.deploy();
  await landRegistry.waitForDeployment();

  return { landRegistry, operator, citizen, newOwner, intruder };
}

/**
 * Fresh contract with one property (PROP-2026-0001) already registered and
 * owned by `citizen`. Also returns the registration block timestamp.
 */
async function registeredPropertyFixture() {
  const base = await deployLandRegistryFixture();
  const propertyId = ethers.id("PROP-2026-0001");

  const tx = await base.landRegistry
    .connect(base.operator)
    .registerProperty(propertyId, base.citizen.address);
  const receipt = await tx.wait();
  const block = await ethers.provider.getBlock(receipt.blockNumber);

  return { ...base, propertyId, registeredAt: BigInt(block.timestamp) };
}

describe("LandRegistry", function () {
  describe("deployment", function () {
    it("assigns the deployer as the initial operator", async function () {
      const { landRegistry, operator } = await loadFixture(deployLandRegistryFixture);

      expect(await landRegistry.operator()).to.equal(operator.address);
    });

    it("starts with an empty registry", async function () {
      const { landRegistry } = await loadFixture(deployLandRegistryFixture);

      expect(await landRegistry.propertyCount()).to.equal(0n);
    });
  });

  describe("registerProperty", function () {
    it("registers a property and exposes its owner", async function () {
      const { landRegistry, citizen, propertyId, registeredAt } =
        await loadFixture(registeredPropertyFixture);

      expect(await landRegistry.isRegistered(propertyId)).to.equal(true);
      expect(await landRegistry.getPropertyOwner(propertyId)).to.equal(citizen.address);
      expect(await landRegistry.propertyCount()).to.equal(1n);

      const record = await landRegistry.getProperty(propertyId);
      expect(record.registered).to.equal(true);
      expect(record.owner).to.equal(citizen.address);
      expect(record.registeredAt).to.equal(registeredAt);
      expect(record.updatedAt).to.equal(registeredAt);
    });

    it("emits PropertyRegistered with the correct arguments", async function () {
      const { landRegistry, operator, citizen } = await loadFixture(deployLandRegistryFixture);

      const propertyId = ethers.id("PROP-2026-0001");
      const tx = await landRegistry
        .connect(operator)
        .registerProperty(propertyId, citizen.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(landRegistry, "PropertyRegistered")
        .withArgs(propertyId, citizen.address, BigInt(block.timestamp));
    });

    it("reverts when the property is already registered", async function () {
      const { landRegistry, operator, citizen, propertyId } =
        await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry.connect(operator).registerProperty(propertyId, citizen.address)
      ).to.be.revertedWith(REVERT.ALREADY_REGISTERED);
    });

    it("reverts when the owner is the zero address", async function () {
      const { landRegistry, operator } = await loadFixture(deployLandRegistryFixture);

      await expect(
        landRegistry
          .connect(operator)
          .registerProperty(ethers.id("PROP-2026-0002"), ethers.ZeroAddress)
      ).to.be.revertedWith(REVERT.ZERO_OWNER);
    });
  });

  describe("transferOwnership", function () {
    it("moves ownership to the new owner", async function () {
      const { landRegistry, operator, citizen, newOwner, propertyId, registeredAt } =
        await loadFixture(registeredPropertyFixture);

      await landRegistry
        .connect(operator)
        .transferOwnership(propertyId, citizen.address, newOwner.address);

      expect(await landRegistry.getPropertyOwner(propertyId)).to.equal(newOwner.address);
      expect(await landRegistry.isRegistered(propertyId)).to.equal(true);
      expect(await landRegistry.verifyOwnership(propertyId, citizen.address)).to.equal(false);
      expect(await landRegistry.verifyOwnership(propertyId, newOwner.address)).to.equal(true);

      // Original registration timestamp is preserved; updatedAt moves forward.
      const record = await landRegistry.getProperty(propertyId);
      expect(record.registeredAt).to.equal(registeredAt);
      expect(record.updatedAt).to.be.at.least(registeredAt);
    });

    it("emits OwnershipTransferred with the correct arguments", async function () {
      const { landRegistry, operator, citizen, newOwner, propertyId } =
        await loadFixture(registeredPropertyFixture);

      const tx = await landRegistry
        .connect(operator)
        .transferOwnership(propertyId, citizen.address, newOwner.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(landRegistry, "OwnershipTransferred")
        .withArgs(propertyId, citizen.address, newOwner.address, BigInt(block.timestamp));
    });

    it("reverts when the current owner does not match the expected owner", async function () {
      const { landRegistry, operator, newOwner, propertyId } =
        await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry
          .connect(operator)
          .transferOwnership(propertyId, newOwner.address, newOwner.address)
      ).to.be.revertedWith(REVERT.PROVENANCE_MISMATCH);
    });

    it("reverts when the property does not exist", async function () {
      const { landRegistry, operator, citizen, newOwner } =
        await loadFixture(registeredPropertyFixture);

      const unknownId = ethers.id("PROP-DOES-NOT-EXIST");
      await expect(
        landRegistry
          .connect(operator)
          .transferOwnership(unknownId, citizen.address, newOwner.address)
      ).to.be.revertedWith(REVERT.NOT_REGISTERED);
    });

    it("reverts when the new owner equals the current owner", async function () {
      const { landRegistry, operator, citizen, propertyId } =
        await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry
          .connect(operator)
          .transferOwnership(propertyId, citizen.address, citizen.address)
      ).to.be.revertedWith(REVERT.SAME_OWNER);
    });

    it("reverts when the new owner is the zero address", async function () {
      const { landRegistry, operator, citizen, propertyId } =
        await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry
          .connect(operator)
          .transferOwnership(propertyId, citizen.address, ethers.ZeroAddress)
      ).to.be.revertedWith(REVERT.ZERO_NEW_OWNER);
    });
  });

  describe("ownership verification & reads", function () {
    it("verifyOwnership accepts the rightful owner and rejects everyone else", async function () {
      const { landRegistry, citizen, intruder, propertyId } =
        await loadFixture(registeredPropertyFixture);

      expect(await landRegistry.verifyOwnership(propertyId, citizen.address)).to.equal(true);
      expect(await landRegistry.verifyOwnership(propertyId, intruder.address)).to.equal(false);
      expect(
        await landRegistry.verifyOwnership(ethers.id("PROP-UNKNOWN"), citizen.address)
      ).to.equal(false);
    });

    it("getPropertyOwner reverts for an unregistered property", async function () {
      const { landRegistry } = await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry.getPropertyOwner(ethers.id("PROP-UNKNOWN"))
      ).to.be.revertedWith(REVERT.NOT_REGISTERED);
    });
  });

  describe("access control", function () {
    it("reverts when a non-operator registers a property", async function () {
      const { landRegistry, citizen, intruder } = await loadFixture(deployLandRegistryFixture);

      await expect(
        landRegistry
          .connect(intruder)
          .registerProperty(ethers.id("PROP-2026-0001"), citizen.address)
      ).to.be.revertedWith(REVERT.NOT_OPERATOR);
    });

    it("reverts when a non-operator transfers ownership", async function () {
      const { landRegistry, citizen, newOwner, intruder, propertyId } =
        await loadFixture(registeredPropertyFixture);

      await expect(
        landRegistry
          .connect(intruder)
          .transferOwnership(propertyId, citizen.address, newOwner.address)
      ).to.be.revertedWith(REVERT.NOT_OPERATOR);
    });

    it("reverts when a non-operator changes the operator", async function () {
      const { landRegistry, intruder } = await loadFixture(deployLandRegistryFixture);

      await expect(
        landRegistry.connect(intruder).setOperator(intruder.address)
      ).to.be.revertedWith(REVERT.NOT_OPERATOR);
    });
  });

  describe("setOperator", function () {
    it("changes the operator and emits OperatorChanged", async function () {
      const { landRegistry, operator, newOwner } = await loadFixture(deployLandRegistryFixture);

      await expect(landRegistry.connect(operator).setOperator(newOwner.address))
        .to.emit(landRegistry, "OperatorChanged")
        .withArgs(operator.address, newOwner.address);

      expect(await landRegistry.operator()).to.equal(newOwner.address);
    });

    it("revokes the previous operator and empowers the new one", async function () {
      const { landRegistry, operator, citizen, newOwner } =
        await loadFixture(deployLandRegistryFixture);

      await landRegistry.connect(operator).setOperator(newOwner.address);

      // The previous operator loses all registry rights.
      await expect(
        landRegistry
          .connect(operator)
          .registerProperty(ethers.id("PROP-2026-0002"), citizen.address)
      ).to.be.revertedWith(REVERT.NOT_OPERATOR);

      // The new operator can perform registry operations.
      const propertyId = ethers.id("PROP-2026-0003");
      const tx = await landRegistry
        .connect(newOwner)
        .registerProperty(propertyId, citizen.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(landRegistry, "PropertyRegistered")
        .withArgs(propertyId, citizen.address, BigInt(block.timestamp));
    });

    it("reverts when the new operator is the zero address", async function () {
      const { landRegistry, operator } = await loadFixture(deployLandRegistryFixture);

      await expect(
        landRegistry.connect(operator).setOperator(ethers.ZeroAddress)
      ).to.be.revertedWith(REVERT.ZERO_OPERATOR);
    });
  });
});
