# Independent v25 quantity-transaction review

Initial reviewed commit: `4a220c9b78c165ed747e66b305b68fee4dfe0c95`.
Review date: 2026-10-10 UTC. Source review was read-only; only review evidence was written.

## Initial findings

### P1: A captured confirm press can authorize a different quantity or replacement modal

Locations at reviewed commit: `src/application/session.ts:264–268,303–310,350`; `src/presentation/input.ts:93–94`.

Tool quantity mutation and modal closing/opening do not cancel captured pointer state. Input release invokes a previously captured generic `confirm` action against the current modal.

Observed reproduction using `sessionHost({wallet:1000})` and the current confirm button's center:

1. Open rotate purchase at quantity 1, `input.down(confirm)`, dispatch `purchaseQuantity +1`, then `input.up(confirm)`.
2. Result: wallet 840, rotate inventory 2. The confirmation held for quantity 1 executes quantity 2.
3. Separate fixture: open rotate, `input.down(confirm)`, dispatch cancel, open wildcard, `input.up(confirm)`.
4. Result: wallet 840, wildcard inventory 1. A stale press executes the replacement modal.

Suggested fix: invalidate captured input on quantity changes and tool modal opening/closing, or bind captured controls to modal identity and revision. Add regression tests for both interleavings. This is a specific requested pointer-invalidation invariant, even though a single normal pointer gesture does not itself dispatch the intermediate action.

### P2: A storage-generation conflict leaves the shop displaying an unrecoverable stale snapshot

Location at reviewed commit: `src/application/session.ts:309` (compare existing cosmetic-set refresh handling at lines 293–298).

Observed reproduction: open rotate modal using session fixture generation 1; commit a clear purchase through a second account-service instance over the same storage; confirm rotate; reopen and confirm twice more. Every attempt returns `账户已更新，请重新读取`; session display remains generation 1 while storage is generation 2. No partial purchase is committed, but reopening cannot recover.

Suggested fix: refresh and publish the account after the stale-generation rejection, require a fresh modal, and block if refresh cannot establish a valid account. Add a real storage-update regression rather than only mutating the view generation.

## Independently executed selected tests

Command:

```
node --test tests/tool-quantity-account.test.ts tests/tool-quantity-ui.test.ts tests/account-service.test.ts tests/account-store.test.ts tests/account-migration.test.ts tests/shop-scroll-input.test.ts tests/dialog-roles-waste-copy.test.ts
```

Result: 127 tests, 127 passed, 0 failed. Raw output: `focused-review-initial.txt`.

These passing tests did not cover the two reproduced findings above. This is not a full-suite-green claim.

## Account-review evidence and limits

- Optional legacy purchase fields remain omitted in request digest; quantity defaults only in transaction preparation.
- Quantity and quoted price validate as safe integers, rejecting invalid explicit fields; multiplication and resulting inventory addition are checked before mirrored account commit.
- Existing operation ID plus request digest binds quantity, item, quote, and expected generation, including restart receipt checks.
- Selected tests exercise paid and free policy compilation, MAX_SAFE_INTEGER stock/total boundaries, insufficient funds, active-run rejection, repeat receipts, every before/after I/O fault, failed mirror recovery, and either corrupt mirror.
- Account schema, catalog, carry reservation logic, and art assets were not changed by this review.
- No build or release was performed. No browser screenshots were independently captured or visually assessed in this review. Production paid mode remains a logic-test result, not authorization to release it.

## Final re-review: findings resolved

Final reviewed HEAD: `b7d7751501365312d5c917da49b8a6790004283b`.

- P1 resolved: pointer release now checks modal identity and quantity, and every actual quantity mutation cancels active input. The additional quantity ABA reproduction (1 → 2 → 1 while confirm is held) was independently observed before the second fix and is now covered by a passing regression.
- P2 resolved: rejected stale-store purchases refresh and publish the current account, close the old modal, and require a fresh explicit confirmation. Failed refresh blocks account actions.
- Fresh final execution of the same selected command: **131 tests, 131 passed, 0 failed**, exit 0. Raw output: `focused-review-final.txt`.
- No unresolved blocking findings in the inspected scope. This conclusion does not claim a full-suite run, browser QA, packaged build verification, or production-release approval.

Reviewed file SHA-256 values:

```
40389aca20e7d5ccb939f414a4bb1df854127bf9c93ac8c21f3d659f76e2b510  src/application/session.ts
6cb71811f89edf8ab24c4a7fa334878013e15b6ac85a080f39beb96299cb488b  src/presentation/input.ts
34a7a1f86154c186d041ca62db263f925436aadf25b8e3e3c15f3277f25f6979  src/application/account-service.ts
0bcb9d4069ed266b22f77e0e7ff046c2edc3badceb94cd5c2ddaf802891d739c  src/application/tool-purchase.ts
858417502812b067f998b68aa6a19d9f848256d37c46579cf6c92ef1b8752216  tests/tool-quantity-ui.test.ts
```

## Frozen-commit supplemental review

Reviewed frozen HEAD: `692573585ec0757ab52dec2e3a214b71560430f1`.
Compared the increment from `b7d7751` in session, tool-purchase helper, renderer, view types, and quantity UI tests. The confirmation/opening helper extraction preserves the existing guards, exact batch request, generation check, and refresh-on-conflict behavior. The new tool-only notice exposes revalidation errors in the shop, clears on a new modal/shop visit, and yields to persistence warnings. No new blocking finding in this increment.

Independently reran the same selected seven-file test command against the frozen commit: **132 tests, 132 passed, 0 failed**, exit 0, including original pointer interleavings, quantity ABA, stale-store recovery, and the new notice-render regression. Raw output: `focused-review-frozen.txt`.

This supplemental review did not rerun the full suite, build, or browser host tests. Their separately reported results are not independent reviewer verification. No product source was modified by this reviewer.

Frozen increment SHA-256 values:

```
2e4cd4f6e8d049dbdfcaf6b8abaf5cdb06ce60cd8a7920cf1bc0330afe2d9a09  src/application/session.ts
d8065aa27c712c6e04253b9e7bfc3566963afdd8805b08c5572c129aad5398cf  src/application/tool-purchase.ts
d54231c5d36197136ebecb45649ac2ebd219f23049d255980b5171010d696405  src/presentation/renderer.ts
1e6fa7e32dc0ceda920cb4a97a3f8f9f9b756a5bbd500ca40a97946add6622c6  src/presentation/view-types.ts
07b8dacffae785886b0eefb0b2c380cbb57d8fbe2cb29c1aafad1366f3eeeb58  tests/tool-quantity-ui.test.ts
```
