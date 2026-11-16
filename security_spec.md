# CampusTrace Security Specification & Audit

## 1. Data Invariants
1. **No Public PII Exposure**: `notices` documents never store `reporterWhatsApp`, `managementToken`, or `verificationQuestions[].expectedAnswer`. Those live exclusively in `noticeSecrets/{tokenHash}` where `tokenHash = sha256(managementToken)`.
2. **Ownership Before Contact**: `reporterWhatsApp` is only written to `claimHandovers/{claimCodeHash}` after a claim is approved, and `claimHandovers` cannot be listed publicly (`allow list: if isAdmin()`).
3. **Single Active Approved Claim**: A notice can only transition `approvedClaimId` from `null` to a valid `claimId` that belongs to that notice. Approving a second claim while `approvedClaimId != null` is rejected unless revoked first.
4. **Ugandan Phone Format**: All WhatsApp numbers (`+256XXXXXXXXX`) must strictly match `^\+256\d{9}$`.
5. **Immutable Audit Fields**: `createdAt`, `type`, `reporterPhoneHash`, `claimantPhoneHash`, and `claimCodeHash` cannot be mutated after creation.
6. **Temporal Integrity**: All `createdAt`, `updatedAt`, and `bannedAt` fields must equal `request.time`.
7. **Admin Privilege Boundary**: Admin actions (`reports` read/resolve, `bannedNumbers` list/create/delete, notice removal, evidence purge) require `isAdmin()`, verified via `admins/{uid}` or verified bootstrapped admin email (`kalemeragodie@gmail.com` with `email_verified == true`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Be Denied)
1. **Shadow Field Injection on Notice**: `notices` create payload with extra `isVerified: true` -> denied by `keys().hasOnly(...)`.
2. **PII Leak in Notice**: `notices` create payload attempting to inject `reporterWhatsApp: "+256700000000"` -> denied by `keys().hasOnly(...)`.
3. **Invalid Phone Format**: `noticeSecrets` create payload with `reporterWhatsApp: "0771234567"` -> denied by `matches('^\\+256\\d{9}$')`.
4. **Oversized Title / DoW Attack**: `notices` create payload with 5,000-char `title` -> denied by `title.size() <= 120`.
5. **Path ID Poisoning**: `notices` create with document ID containing invalid characters (`../../admins/hack` or >128 chars) -> denied by `isValidId(noticeId)`.
6. **Timestamp Spoofing**: `notices` create with backdated `createdAt` (`!= request.time`) -> denied by `incoming().createdAt == request.time`.
7. **Orphaned Claim**: `claims` create referencing a non-existent `noticeId` -> denied by `exists(/databases/$(database)/documents/notices/$(incoming().noticeId))`.
8. **Double Approval Bypass**: `notices` update trying to overwrite an existing `approvedClaimId` without revoking first -> denied by `existing().approvedClaimId == null`.
9. **Terminal State Mutation**: `notices` update trying to reopen a `'removed'` notice without `isAdmin()` -> denied by terminal state lock.
10. **Unverified Admin Spoofing**: Request claiming admin privileges where `email_verified == false` -> denied by `request.auth.token.email_verified == true`.
11. **Public Scraping of Banned Numbers / Reports**: Unauthenticated `list` query on `bannedNumbers` or `reports` -> denied by `allow list: if isAdmin()`.
12. **Resubmit Hijack**: `claims` update trying to self-approve (`status: 'approved'`) while changing `answers` or `evidenceUrls` -> denied by action-based `affectedKeys().hasOnly(...)` separation.
