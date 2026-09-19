# Aabhushan Jewellery Management

## Overview

Aabhushan Jewellery Management is a web application for Aabhushan’s jewellery business that brings article-level inventory, barcode tagging, invoicing, payment tracking, customer records, and Girvi management into one system. It helps the owner and staff replace disconnected registers and manual calculations with traceable workflows, accurate invoice and interest calculations, and automated WhatsApp notifications. The MVP serves one business and one branch through a Next.js frontend and an independent Node.js/Express backend that can also support a future mobile app. Supabase Free provides authentication and PostgreSQL initially, private Supabase Storage holds files, and pg-boss processes background jobs without Redis.

## Goals

- Give every physical jewellery article a unique record and scannable tag, with stock movements traceable from receipt through sale or return.
- Complete barcode-based billing using server-validated calculations that match the owner’s approved invoice examples, without manual total calculation or duplicate article sales.
- Track every recorded collection, refund, and invoice allocation so staff can explain each customer’s outstanding sales balance.
- Manage Girvi accounts from opening and collateral receipt through interest calculation, repayment, settlement, and physical release, using the shop’s confirmed calculation rules.
- Provide scheduled customer notifications and a dashboard that clearly separates sales, collections, customer dues, Girvi principal, and interest received.
- Keep business rules in one reusable backend while operating the initial release with Supabase Free and a PostgreSQL-backed queue.

## Core User Flow

1. An authorized staff member signs in using Supabase Auth and accesses the screens permitted by their role.
2. Inventory staff receive jewellery, create individual article records with purity, weights, source, and location, and print a unique barcode tag for each piece.
3. Billing staff select or create a customer and scan article tags to add available jewellery to an invoice draft.
4. The backend calculates metal value, making charges, applicable wastage and stone charges, discounts, taxes, and rounding using the selected rates and approved rules.
5. Staff review the calculation, record full, partial, or split payment, and finalize the invoice. The backend saves the invoice, stock movements, payment allocations, and audit records together.
6. Staff print the invoice or obtain its PDF. Background jobs generate documents and send eligible WhatsApp notifications; a messaging failure does not undo the sale.
7. Staff collect any remaining invoice balance later, issue receipts, and view the customer’s updated statement. Authorized staff handle returns and refunds through linked correction records.
8. For a Girvi transaction, authorized staff select the customer, record collateral and custody details, enter the agreed loan terms, and activate the account with the disbursement record.
9. The system calculates Girvi interest from the agreed terms and effective-dated transactions, evaluates reminders, and records repayments against principal and interest separately.
10. Staff settle the Girvi balance and separately confirm physical collateral release before closing the account.
11. The owner reviews sales, collections, dues, stock, Girvi balances, and failed notifications from the dashboard and reports.

## Features

### Staff Access and Shop Settings

- Invite-only staff accounts with owner/admin, billing, inventory, and Girvi permissions enforced by the backend.
- Shop details, daily metal rates, pricing rules, document numbering, printer settings, and reminder preferences.
- Audit history for sensitive actions, including rate overrides, stock adjustments, payment reversals, and collateral release.

### Inventory and Barcode Tagging

- Individual article records with category, metal, purity, gross weight, non-metal weight, net metal weight, stone details, photograph, and applicable HUID.
- Supplier or karigar reference, receipt date, optional acquisition cost, and storage location.
- Unique barcode generation, batch tag printing, and audited tag reprints using the original identifier.
- Search by barcode, article number, category, purity, status, or weight range.
- Stock movement history, availability tracking, physical stock counts, and reviewed adjustments.
- Returned articles remain unavailable for resale until inspected and released back into available stock.

### Invoicing and Automatic Calculations

- Barcode-based POS with manual article lookup, customer selection, and resumable invoice drafts.
- Configurable making-charge methods and the shop’s approved wastage, discount, tax, and rounding rules.
- Decimal arithmetic, explicit calculation breakdowns, and backend recalculation before finalization.
- Immutable invoice snapshots that preserve the rates and rules used when the invoice was issued.
- Duplicate-scan checks, concurrent-sale protection, and safe retries after interrupted requests.
- Printable invoices, generated PDFs, and controlled return, credit, and refund workflows.

### Payments and Outstanding Balances

- Manually verified cash, UPI, bank transfer, and card payment recording.
- Split tender, partial payments, later collections, payment references, and numbered receipts.
- Invoice-level payment allocations and customer statements showing remaining sales dues.
- Audited reversals and refunds that preserve original transaction history.
- Daily collections grouped by payment method, separate from sales totals.

### Customer Management and WhatsApp Notifications

- Customer profiles, normalized contact details, purchase history, receipts, and outstanding invoices.
- Separate views for sales dues and Girvi accounts belonging to the same customer.
- Communication consent, preferences, and notification history.
- Transactional invoice, receipt, due-payment, and Girvi notifications through an official WhatsApp integration, subject to provider approval and supported templates.
- Scheduled reminders, delivery status where available, bounded retries, and visible failed or uncertain sends.
- Consent and balance checks immediately before sending to avoid reminders for settled accounts.

### Girvi Management

- Unique Girvi accounts with customer, collateral photographs, item weights, purity, assessed value, packet number, and custody location.
- Principal, disbursement details, start date, maturity date, and a snapshot of the agreed interest terms.
- Reproducible interest calculations using the shop’s confirmed rate period, day/month convention, payment allocation, and rounding rules.
- Statements that distinguish outstanding principal, accrued unpaid interest, principal recovered, and interest received.
- Partial repayments, settlement quotes, printed acknowledgments, and eligible WhatsApp reminders.
- Separate financial settlement and physical release actions, with staff and customer acknowledgment records.
- Collateral maintained separately from saleable inventory; overdue accounts never automatically convert pledged items into shop stock.

### Dashboard and Reports

- Sales, invoice count, returns, collections, and outstanding customer dues for a selected period.
- Available article counts and metal weights by category and purity.
- Active Girvi accounts, outstanding principal, accrued unpaid interest, upcoming maturities, and overdue accounts.
- Separate reporting for Girvi disbursements, principal repayments, and interest receipts.
- Stock discrepancies, failed notifications, and operational items requiring attention.
- Exportable inventory, sales, dues, and Girvi statements.

### Platform and Reliability

- Next.js web frontend and versioned Node.js/Express REST API shared with future mobile clients.
- Supabase Auth, PostgreSQL, and private file storage, with backend-controlled business access.
- pg-boss workers and a transactional outbox for durable asynchronous processing without Redis.
- Opening-data imports for articles, customer dues, and existing Girvi accounts with reviewed balances and accrual dates.
- Automated independent backups, recovery procedures, health monitoring, and access-controlled documents.

## Scope

### In Scope

- One business and one branch with multiple authorized staff accounts.
- Online web application covering inventory, tagging, invoicing, payments, customers, Girvi, and dashboard reports.
- Keyboard-style barcode scanner support and tag layouts validated against the shop’s actual printer.
- Accurate invoice calculations and the specific Girvi interest method approved by the owner before implementation.
- Manual payment verification and recording, including split and partial payments.
- Transactional WhatsApp integration and reminders, subject to account readiness and provider eligibility.
- Private document storage, invoice and receipt PDFs, audit records, opening imports, and operational exports.
- Supabase Free initially, with quota monitoring, independent backups, and defined upgrade triggers.
- Separate always-on application hosting and worker execution; hosting, SMTP, backups, and messaging costs are budgeted independently of Supabase.

### Out of Scope

- Mobile application UI, customer self-service portal, and offline financial transactions or synchronization.
- Multi-business SaaS onboarding, subscription billing, multi-branch transfers, and advanced organization administration.
- Redis, microservices, and mandatory WebSocket or realtime infrastructure.
- Payment gateways, automatic UPI confirmation, bank reconciliation, and full accounting or statutory filing.
- Old-gold purchasing or exchange, full supplier-payable accounting, and karigar job-work management.
- Loyalty programs, savings schemes, promotional WhatsApp campaigns, RFID, and automatic market-rate feeds.
- Girvi top-ups, renewals, partial collateral release, disposal/auction workflows, and additional interest methods beyond the confirmed MVP method.
- Profit reporting until acquisition costs and costing rules are complete and reliable.
- A promise of zero infrastructure cost, uninterrupted Free-tier availability, or automatic Supabase Free backups.

## Success Criteria

- An invited staff member can sign in and perform only permitted actions; restricted records and operations cannot be accessed by bypassing the UI.
- Staff can receive an article, print its tag, scan it using the shop’s actual scanner, and retrieve the correct record without manual identifier entry.
- Invoice totals match owner-approved examples covering weights, purity, charges, discounts, applicable taxes, and rounding; changing daily rates does not change issued invoices.
- When two counters attempt to sell the same article, only one sale commits. Retrying a committed finalization or payment request does not create duplicate records.
- Full, partial, and split payments produce correct receipts and balances; returns, refunds, and reversals preserve a traceable transaction history.
- Girvi calculations match approved examples for partial repayment, date boundaries, opening balances, and settlement. Financial settlement and physical collateral release are recorded separately.
- Eligible WhatsApp notifications are queued and tracked, settled accounts are excluded from due reminders, and worker restarts recover pending work without uncontrolled duplicate sends.
- Dashboard sales, collections, customer dues, and Girvi figures reconcile with their underlying records for the same business-date range.
- Printed tags and invoices are legible on the actual hardware, and private documents are accessible only through authorized access.
- A backup restoration drill recovers the required database records and files into a separate environment before launch; quota, backup, and worker monitoring are operational.
- Representative testing targets barcode lookup below 500 ms p95 and invoice finalization below 2 seconds p95 under the agreed pilot load; these are measured acceptance targets, not untested guarantees.
- The owner confirms calculation rules, sample outputs, opening balances, hardware, and messaging requirements before live transactions begin.
