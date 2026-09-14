// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title LandRegistry
 * @notice Minimal on-chain property registry for the LAND LEDGER digital
 *         property registry platform.
 *
 * The contract stores only opaque property identifiers (bytes32) and the
 * address of the current owner. No citizen personally identifiable
 * information (PII) and no files/documents ever go on-chain — those live in
 * the platform's off-chain encrypted storage, keyed by the same property
 * identifier. The chain is the single source of truth for "who owns what".
 *
 * Registry operations (register, transfer, operator rotation) are restricted
 * to a single trusted operator account: the backend service wallet that
 * deploys the contract. The operator can be rotated via {setOperator}.
 */
contract LandRegistry {
    // -------------------------------------------------------------- Types

    /// @notice Registry record for a single property identifier.
    struct Property {
        bool registered; // True once the property has been registered.
        address owner; // Current owner (a citizen wallet address).
        uint64 registeredAt; // Unix timestamp of the original registration.
        uint64 updatedAt; // Unix timestamp of the last ownership change.
    }

    // ------------------------------------------------------------ Storage

    /// @dev Property records keyed by their opaque bytes32 identifier.
    mapping(bytes32 => Property) private _properties;

    /// @notice Backend operator authorized to perform registry operations.
    address public operator;

    /// @notice Number of properties ever registered (monotonic counter).
    uint256 public propertyCount;

    // ------------------------------------------------------------- Events

    /// @notice Emitted when a new property enters the registry.
    event PropertyRegistered(
        bytes32 indexed propertyId,
        address indexed owner,
        uint64 timestamp
    );

    /// @notice Emitted when an existing property changes owner.
    event OwnershipTransferred(
        bytes32 indexed propertyId,
        address indexed previousOwner,
        address indexed newOwner,
        uint64 timestamp
    );

    /// @notice Emitted when the operator account is rotated.
    event OperatorChanged(
        address indexed previousOperator,
        address indexed newOperator
    );

    // ---------------------------------------------------------- Modifiers

    /// @dev Restricts registry operations to the backend operator account.
    modifier onlyOperator() {
        require(msg.sender == operator, "LandRegistry: caller is not the operator");
        _;
    }

    // -------------------------------------------------------- Constructor

    /// @notice The deployer becomes the initial operator.
    constructor() {
        operator = msg.sender;
    }

    // ----------------------------------------------------------- Functions

    /**
     * @notice Registers a brand new property under `owner`.
     * @param propertyId Opaque on-chain property identifier (e.g. derived
     *        off-chain from the public property code; no PII embedded).
     * @param owner Wallet address of the initial owner.
     */
    function registerProperty(bytes32 propertyId, address owner) external onlyOperator {
        require(
            !_properties[propertyId].registered,
            "LandRegistry: property already registered"
        );
        require(owner != address(0), "LandRegistry: owner is zero address");

        _properties[propertyId] = Property({
            registered: true,
            owner: owner,
            registeredAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp)
        });

        propertyCount += 1;

        emit PropertyRegistered(propertyId, owner, uint64(block.timestamp));
    }

    /**
     * @notice Transfers ownership of a registered property to `newOwner`.
     * @param propertyId Property identifier to transfer.
     * @param expectedCurrentOwner Owner address the caller (backend) believes
     *        currently owns the property. The on-chain owner must match it
     *        exactly — this proves the backend's read was not stale/torn.
     * @param newOwner Wallet address of the new owner.
     */
    function transferOwnership(
        bytes32 propertyId,
        address expectedCurrentOwner,
        address newOwner
    ) external onlyOperator {
        Property storage property = _properties[propertyId];

        require(property.registered, "LandRegistry: property not registered");
        // \u2014 is an em dash; a unicode literal is used because plain Solidity
        // string literals are ASCII-only.
        require(
            property.owner == expectedCurrentOwner,
            unicode"LandRegistry: caller provenance mismatch \u2014 current owner does not match expected owner"
        );
        require(newOwner != address(0), "LandRegistry: new owner is zero address");
        require(newOwner != property.owner, "LandRegistry: new owner equals current owner");

        address previousOwner = property.owner;
        property.owner = newOwner;
        property.updatedAt = uint64(block.timestamp);

        emit OwnershipTransferred(
            propertyId,
            previousOwner,
            newOwner,
            uint64(block.timestamp)
        );
    }

    /**
     * @notice Returns the current owner of a registered property.
     * @dev Reverts for unknown/unregistered identifiers (fail loudly for the
     *      backend instead of silently returning the zero address).
     */
    function getPropertyOwner(bytes32 propertyId) external view returns (address) {
        require(_properties[propertyId].registered, "LandRegistry: property not registered");
        return _properties[propertyId].owner;
    }

    /**
     * @notice True if `propertyId` is registered AND owned by `claimedOwner`.
     */
    function verifyOwnership(
        bytes32 propertyId,
        address claimedOwner
    ) external view returns (bool) {
        Property storage property = _properties[propertyId];
        return property.registered && property.owner == claimedOwner;
    }

    /// @notice True if the property identifier has been registered.
    function isRegistered(bytes32 propertyId) external view returns (bool) {
        return _properties[propertyId].registered;
    }

    /// @notice Full registry record for a property identifier.
    /// @return registered Whether the property is registered.
    /// @return owner Current owner address (zero address if unregistered).
    /// @return registeredAt Unix timestamp of the original registration.
    /// @return updatedAt Unix timestamp of the last ownership change.
    function getProperty(
        bytes32 propertyId
    )
        external
        view
        returns (bool registered, address owner, uint64 registeredAt, uint64 updatedAt)
    {
        Property storage property = _properties[propertyId];
        return (property.registered, property.owner, property.registeredAt, property.updatedAt);
    }

    /**
     * @notice Rotates the operator account to `newOperator`.
     * @dev Only callable by the current operator. The new operator takes
     *      effect immediately; the previous one loses all registry rights.
     */
    function setOperator(address newOperator) external onlyOperator {
        require(newOperator != address(0), "LandRegistry: operator is zero address");

        address previousOperator = operator;
        operator = newOperator;

        emit OperatorChanged(previousOperator, newOperator);
    }
}
