# Indotek Pro — Enterprise Security Specification & Governance Architecture (Phase 4 RBAC & Workflow)

## 1. Role Model & Segregation of Duties (SoD)

Indotek Pro implements a configurable, multi-tier Role-Based Access Control (RBAC) model aligned with construction industry standards (ISO 19650 & LPJK guidelines).

### 8 Standard Structural Roles:
1. **Owner / Director**: Executive sponsor with unrestricted company-wide visibility, ultimate approval authority on budget addendums, purchase orders, milestone sign-offs, and team governance.
2. **Project Manager**: Operational lead responsible for assigned projects, critical path monitoring, SPP issuance, subcontractor verification, field report sign-off, and BAST validation.
3. **Site Manager / Supervisor**: Field supervisor responsible for daily site operations, mandor/workforce attendance, weather logs, daily report creation, and stock discrepancy initiation.
4. **Quantity Surveyor / Estimator**: Cost controller managing Bill of Quantities (BOQ), unit price analysis, budget line utilization, and drafting budget revision addendums.
5. **Finance / Accounting**: Corporate financial controller auditing disbursement of petty cash, tracking contractor invoicing, tax compliance, and budget variance monitoring.
6. **Procurement**: Vendor logistics officer issuing Surat Permintaan Pengadaan (SPP), comparative quotation analysis, and purchase order tracking.
7. **Warehouse / Inventory**: Site logistics keeper managing material physical receipt, dispatch notes (Surat Jalan), stock cards, and physical count (Opname) submissions.
8. **Read-only Auditor**: External / internal compliance auditor with read-only visibility into portfolio metrics, reports, and append-only audit trails without write or approval capabilities.

### Separation of Concerns:
- **Company-level permissions**: Defined in `/admins/{uid}` and `RolePermissions`. Controls workspace identity, member invitation, role modifications, and global financial review.
- **Project-level assignments**: Controlled via `assignedProjects` on user profiles. Site supervisors and logisticians cannot modify data outside their assigned projects.
- **Module-level permissions**: Granular boolean flags (`canView`, `canCreate`, `canEdit`, `canSubmit`, `canApprove`, `canReject`, `canArchive`, `canExport`) per functional module.
- **Approval authority**: Specific authorities (`budgetRevision`, `purchaseOrder`, `stockAdjustment`, `fieldReport`, `milestoneSignOff`, `roleManagement`, `pettyCash`) checked before allowing state transitions.

---

## 2. Security Enforcement & Data Invariants

1. **Zero-Trust Identity**: No unauthenticated client can read or write any business collection (`match /{document=**} { allow read, write: if false; }`).
2. **User Profile Isolation & Non-Escalation**: Users may only read and write their own `/users/{userId}`. Non-administrators cannot modify `role` or self-assign elevated privileges (`incoming().role == existing().role`).
3. **Immutable Identifiers**: Project `code`, PO numbers, revision numbers, creator IDs, and timestamps cannot be mutated after creation.
4. **Strict Schema Bounds**: Every document write is checked against explicit schema bounds (`isValid[Entity]` with size, type, and field bounds).
5. **No Shadow Fields**: Incoming payloads must only contain schema-declared fields.
6. **Financial Integrity**: Contract values, budget amounts, and PO costs must be non-negative numbers.
7. **Approval Terminal State Protection**: Once an entity reaches an approved or terminal state (`Disetujui`, `Ditolak`, `Selesai`), regular clients cannot revert or silently edit values.
8. **Append-Only Immutable Audit Trail**: `/audit_logs/{logId}` is strictly append-only (`allow create: if isSignedIn(); allow update, delete: if false`). No actor can rewrite history.
9. **Role & Membership Administration**: Modifying user roles and project assignments in `/team_members/{memberId}` is strictly reserved for authenticated administrators (`isAdmin()`).

---

## 3. Approval Workflows & State Machines

Every workflow adheres to explicit actor transitions:

| Workflow | Initiator Role | Required Approver | Allowed State Transitions | Required Evidence / Fields |
|---|---|---|---|---|
| **Budget Revision** | Quantity Surveyor / PM | Owner / Director, PM | `Menunggu` -> `Disetujui` \| `Ditolak` | Justification note, division name, variance amount |
| **Purchase Order** | Procurement / PM | Project Director, PM | `Draft` -> `Menunggu` -> `Disetujui` \| `Ditolak` -> `Dikirim` -> `Selesai` | SPP No, supplier name, item description, total cost |
| **Stock Adjustment** | Warehouse / Supervisor | Project Manager, Director | `Menunggu` -> `Disetujui` \| `Ditolak` | Physical count, system stock, discrepancy reason, Berita Acara (BA) |
| **Petty Cash** | Site Engineer / Supervisor | Finance / PM | `Menunggu` -> `Disetujui` \| `Ditolak` -> `Dicairkan` | Receipt proof, category, purpose, amount |
| **Field Report** | Site Supervisor | Project Manager | `Draft` -> `Diverifikasi` -> `Disetujui` \| `Perlu Revisi` | Workforce count, weather conditions, work completed, site photos |
| **Milestone Sign-Off** | Site Engineer / PM | Project Manager, Director | `Berjalan` -> `Disahkan BAST` | BAST reference document, quality confirmation, inspection notes |

*Rejection Constraint*: All rejection transitions (`Ditolak` / `Perlu Revisi`) require mandatory non-empty justification reasons stored in the document and logged in audit trails.

---

## 4. Notifications System & Deduplication

In-app notifications are filtered by:
1. **Recipient Role Authorization**: Target roles (`targetRoles`) must match user active role or Owner/Director.
2. **Project Authorization**: Users only receive notifications for projects they are assigned to.
3. **Deduplication Key (`dedupKey`)**: Idempotent key structure (e.g. `rev-app-{id}`, `po-sub-{id}`) prevents duplicate notifications on repeated or retried network requests.

---

## 5. Audit Trail Architecture

The `/audit_logs/{logId}` collection records:
- **Actor Identity**: UID, Full Name, Email, Role.
- **Context**: Workspace ID, Project ID, Project Name.
- **Action Type**: Explicit action enum (e.g. `BUDGET_APPROVED`, `PO_REJECTED`, `STOCK_ADJUSTED`, `MEMBER_ROLE_CHANGED`).
- **Record Reference**: Record type (e.g. `budget`, `purchase_order`, `material`) and Record ID.
- **Timestamp & Correlation ID**: ISO 8601 UTC timestamp and unique tracing correlation identifier.
- **Delta Summary**: `previousValue` -> `newValue` and structured metadata for forensic auditability.

---

## 6. Security Limitations & Remaining Risks

1. **Client-Side Clock Synchronization**: While Firestore rules enforce string length and date formatting, client devices with skewed system clocks may record slightly deviant client-side timestamps. For critical financial books, server-authoritative timestamps (`request.time`) are enforced in security rules.
2. **Offline Resilience vs. Immediate Revocation**: Firestore offline caching allows local reads while disconnected. A deactivated user's local cache remains readable until reconnected, but all write attempts immediately fail with `PERMISSION_DENIED` upon reconnection.
3. **Simulated Role Switcher in Preview**: The development preview interface includes a role switcher in the Topbar to evaluate RBAC and multi-persona workflows. In production environments, user roles are bound strictly to Firebase Auth Custom Claims issued by trusted server functions.
4. **List Query Rule Constraints**: In Cloud Firestore, security rules cannot dynamically iterate across large arbitrarily nested arrays without query index constraints. Multi-project assignments are indexed flatly on user profile documents to maintain high throughput and predictable costs.
