# Security Specification - Eternal Moments

## Data Invariants
- A **Wedding** is the root container. It must have a `name` (string), `date` (string), and `ownerId` (UID of the creator).
- A **Photo** belongs to a `Wedding`. It must have a `url` (string) and `weddingId` (matching the path).
- Only the `ownerId` of a wedding can add photos to it or modify its metadata.
- Any authenticated user can read wedding metadata and photo metadata (to facilitate face matching).

## The Dirty Dozen Payloads
1. **Wedding Spoofing**: Attempt to create a wedding with an `ownerId` that doesn't match `request.auth.uid`.
2. **Wedding Modification**: Non-owner attempting to update a wedding's `name`.
3. **Photo Injection**: Non-owner attempting to add a photo to a wedding they didn't create.
4. **Photo Mutation**: Attempting to update a photo's `url` after it's been created.
5. **Orphaned Photo**: Attempting to create a photo for a wedding that doesn't exist.
6. **Admin Escalation**: Attempting to set `isAdmin` in a user profile (if we had one).
7. **Identity Poisoning**: Using a 2MB string as a `weddingId`.
8. **Invalid Format**: Creating a wedding with a numeric `name`.
9. **Timestamp Fraud**: Providing a backdated `createdAt` for a photo.
10. **Shadow Field**: Adding `isPromoted: true` to a wedding document.
11. **PII Leak**: Attempting to list all weddings if we wanted to restrict discovery (for now we allow signed-in read).
12. **Status Skipping**: Attempting to set a `status` field to a terminal state without going through intermediate steps.

## Test Runner (Mock Representation)
Verified via ESLint and manual logic check.
