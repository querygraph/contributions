# @querygraph/contributions

Shared publishing machinery for aile.ss wings and disappointed.us sighs. Apps
compose these small modules over their own data, identity, validation and UI.
There are no runtime dependencies and browser modules do not import Node code.

## Ownership

| Core | Application | Existing shared packages |
| --- | --- | --- |
| Draft storage, quota fallback, advisory leases and notifications | Draft codecs, namespace, auth consent and account binding | Verdun accounts and authentication |
| Creation/attachment stage ordering and retry checkpoints | Idempotent endpoint, creation receipts and one-time effects | Verdun image normalization and picker |
| Photo replay, quota/upload/conditional-commit orchestration | Author/visibility checks, SQL compare-and-swap, quotas, Blob config, card invalidation | Ontology concept identities and navigation |
| Reversible composer busy controls and escaped presentation | Product copy, fields, classification, feed ranking and routing | |

A wing retains activity + ontology concept. A sigh retains target identity +
ontology concept. Disappointed owns target aliases, addresses, subdomain review,
venues, evidence, share cards and target-dependent visibility. This package
contains no data tables and does not combine the applications' accounts or data.

## Modules

- `drafts`: `createDraftStore({key, decode, fallback, acceptClaimSave})`,
  `bestEffortStorageWrite`, confirmation/prompt helpers. Save returns
  `{saved, fallbackUsed}`; a text-only fallback must be disclosed by the app.
  Keep v1 app envelopes/codecs unchanged. `clear` checks the expected draft ID.
  Watchers re-read storage and only notify; they never submit. Browser leases are
  advisory; use Web Locks when available and retain server idempotency.
- `publication`: `runPublication({resolveRecord, attachment, onStage})`.
  Call after explicit consent/auth/account validation. The app resolves a known
  receipt or replays its account-scoped idempotent endpoint. An upload/removal
  checkpoints intent before network access. Clear the draft only after success.
  Preserve a receipt and attempted-upload marker across ambiguous responses.
- `attachments`: `updatePhoto` orders owned-visible lookup, normalization,
  exact stored digest reuse, quota charge, upload and conditional commit. Removal
  skips decoding, storage configuration and quota. A commit callback **must**
  recheck account/author/visibility and the observed URL **and alt text** atomically.
  A changed target, archived record or concurrent attachment must not be revived.
  Return values retain normalized photo fields: project public metadata explicitly
  in an API response; never serialize an image buffer. Orphan cleanup remains a
  storage policy; a rejected conditional commit never points a record at that blob.
- `composer`: `createComposerControls({root, inert})` captures disabled/inert
  state, applies `aria-busy`, and restores the original state on completion/failure.
- `presentation`: escaped photo/author/count helpers and date formatting; callers
  choose styles and labels. Editorial and member counts remain separate.
- `idempotency` (server only): fixed-order JSON SHA-256 and conflict assertion.
  Material fields, normalization and ordering are app-owned compatibility contracts.
  Database unique constraints remain the authority for simultaneous creation.

## Verification and releases

Run `npm ci && npm test`. Tests cover interrupted publication, lost upload
responses, removal/replacement races, inaccessible storage, leases, stale events,
quota fallback, replay fingerprints and browser control restoration. Each app
also tests its real adapter's SQL predicates and browser/auth flows. API boundary
mocking does not constitute a production database write test.

Consumers use `github:querygraph/contributions#<full-commit>` in package.json and
commit the lockfile. Git installs run `prepare` to build declarations and ESM.
Keep browser and server exports separate. Release both adapters against the same
commit; no schema or public URL migration is imposed by this package.
