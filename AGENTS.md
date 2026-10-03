# Contributions core

- Keep this package independent of app databases, account records, routing, ontology data and product copy.
- Preserve app draft codecs and storage namespaces. Authentication and storage events never imply publication consent.
- Apps own atomic account-scoped creation and conditional photo commits. Never replace database idempotency with browser locks.
- Attachment commits must recheck ownership, account status, visibility and the observed URL/alt pair. App callbacks also invalidate derived cards.
- Verdun owns photo decoding, metadata stripping and the photo picker. Do not fork its codecs here.
- Browser exports must not import Node-only code. Idempotency hashing is a separate server export.
- Run npm test before release. Consumers pin exact Git commits.
