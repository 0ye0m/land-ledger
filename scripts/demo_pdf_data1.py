# Demo walkthrough PDF - content data part 1 (sections 1-5)
# Each step: (filename, step title, caption)

SECTIONS_1 = [
    dict(num="01", title="The public face", rng="SCREENS 01-03",
         intro=("Before any login, the product has to make its case. The landing page compresses the whole promise - "
                "tamper-evident land records, accountable offices and real blockchain proof - into a single scroll. "
                "These three screens are your opening minute, so let them breathe."),
         steps=[
            ("01-landing-hero.png", "Landing - the opening promise",
             "LAND LEDGER introduces itself as a blockchain-backed land registry: every record sealed, every action accountable. One line sets the stage before anyone signs in."),
            ("02-landing-features.png", "Feature cards",
             "The feature grid summarises the product: on-chain proof, role-based offices, multi-party consent, document integrity and an immutable audit trail. Point at two or three, promise the rest."),
            ("03-landing-how-it-works.png", "How it works",
             "Register a property, pass office verification, settle the transfer - the three-step journey tells evaluators the whole workflow before they ever touch the app."),
         ]),
    dict(num="02", title="The gate: sign-in and MFA", rng="SCREENS 04-06",
         intro=("Every account - citizen or officer - passes the same gate: a password plus a six-digit code delivered to a "
                "real inbox over live SMTP. The whole scene takes twenty seconds to demo and instantly separates this "
                "platform from a mockup. In the companion recording, the code is typed on camera."),
         steps=[
            ("04-login-page.png", "Sign-in",
             "The sign-in screen ships with quick-fill demo account chips - the same eight accounts listed on the final page of this deck. No hunting for credentials mid-demo."),
            ("05-login-filled.png", "Credentials entered",
             "Om Mandwade's credentials are in. Submitting does not open the app yet - it issues a time-boxed challenge to the registered email address."),
            ("06-mfa-otp-screen.png", "MFA - the six-digit gate",
             "A six-digit code arrives by real email; the session only opens once it is verified. Two-factor authentication is enforced for every role, not just admins."),
         ]),
    dict(num="03", title="The citizen's world", rng="SCREENS 07-13",
         intro=("Om Mandwade owns Flat 503 in Sunrise Residency. His world is the citizen app: a dashboard that says what "
                "needs attention, a property with its full history, and documents sealed with fingerprints. This act builds "
                "the emotional stake before any paperwork starts moving."),
         steps=[
            ("07-citizen-dashboard.png", "Citizen dashboard",
             "Om lands on a working dashboard, not a placeholder: pending actions, key stats and shortcuts surface immediately, so a citizen always knows the next move."),
            ("08-citizen-dashboard-activity.png", "Dashboard activity",
             "Scrolling down: recent properties, transfer activity and the latest chain events give a live snapshot of everything tied to this account."),
            ("09-citizen-properties-list.png", "Properties list",
             "Every parcel this citizen owns or is associated with, with status badges, search and filters. Flat 503 sits here as the star of the demo."),
            ("10-property-detail-overview.png", "Property detail",
             "The property file for Flat 503: owner card, survey data, location and the on-chain record anchored when the property was registered."),
            ("11-property-detail-ownership.png", "Ownership chain",
             "The ownership chain reconstructs the land's full history from ledger events - first holder, every transfer since, and the current owner. Provenance you can read, not trust."),
            ("12-property-detail-timeline.png", "Stage timeline",
             "The stage timeline shows exactly who acted, when, and what note they left. The process is visible to the citizen, not hidden in a back office."),
            ("13-property-detail-documents.png", "Property documents",
             "Documents attached to the property carry SHA-256 fingerprints; each file opens or downloads in one click, and office staff verify the same bytes later."),
         ]),
    dict(num="04", title="Citizen workflows", rng="SCREENS 14-22",
         intro=("Here the citizen does real work: registering property, managing documents and - the heart of this demo - "
                "initiating the transfer of his flat to Ganesh Patil. Transfer TRF-2026-0001 is the case we follow for the "
                "rest of the deck, and consent from every required party must land before any office touches it."),
         steps=[
            ("14-register-property-form.png", "Register property",
             "A new property application: location, survey details and supporting documents in one guided form, filled and ready to submit. This is how land enters the registry."),
            ("15-citizen-documents.png", "Document vault",
             "The citizen's vault: every uploaded file with its hash, type and status - the same bytes the clerk will hash-check later in Act 8."),
            ("16-citizen-transfers.png", "Transfers list",
             "The transfers list, with TRF-2026-0001 waiting on buyer consent - the live case this demo follows end to end."),
            ("17-transfer-consent-detail.png", "Transfer TRF-2026-0001",
             "The transfer file: seller, buyer, the property being sold, and the consent of every required party tracked in one place."),
            ("21-transfer-parties-consent.png", "Consent parties",
             "The parties panel zooms in on consent states - who has approved, who is still to act. Nothing advances until every required signature is on file."),
            ("22-transfer-timeline.png", "Transfer timeline",
             "The transfer's stage timeline records each step with actor and timestamp - a paper trail the blockchain will ultimately stamp."),
            ("18-new-transfer-form.png", "New transfer form",
             "Initiating a transfer: pick the property, name the buyer, agree the amount. The workflow builds its own consent checklist from the ownership data."),
            ("19-citizen-ledger.png", "Citizen ledger view",
             "The blockchain ledger as citizens see it: read-only blocks with hashes and timestamps proving no record was altered after the fact."),
            ("20-citizen-profile.png", "Profile",
             "The profile page closes the citizen tour: identity, contact and role - the account that anchors all of this activity."),
         ]),
    dict(num="05", title="The theme morph", rng="SCREENS 23-25",
         intro=("One design flourish worth showing on purpose: the theme toggle fires a circular reveal that expands from the "
                "exact pixel you clicked, driven by the browser's View Transitions API with a WAAPI clip-path animation. "
                "It is pure polish - and evaluators remember it."),
         steps=[
            ("23-theme-morph-mid-animation.png", "The circular morph",
             "A frame captured mid-morph: the new dark theme blooms outward from the toggle as a growing circle. Origin is the click point itself - keyboard triggers anchor to the button."),
            ("24-dashboard-dark-mode.png", "Dashboard in dark",
             "Twelve hundred milliseconds later the whole dashboard is dark: every surface re-themed, no layout shifted, and the preference persists for the next visit."),
            ("25-property-detail-dark.png", "Property detail in dark",
             "The same property file in dark - panels, badges and the on-chain record all legible, proving the re-theme is complete rather than cosmetic."),
         ]),
]
