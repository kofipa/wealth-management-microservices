# ClearWelth — Wealth Management Platform
## Technical & User Documentation

**Version:** 1.0
**Date:** March 2026
**Domain:** clearwelth.com

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Local Development Setup](#4-local-development-setup)
5. [Service Reference](#5-service-reference)
   - 5.1 User Service
   - 5.2 Asset Service
   - 5.3 Liability Service
   - 5.4 Net Worth Service
   - 5.5 Document Service
   - 5.6 Service Registry
   - 5.7 Open Banking Service
6. [API Reference](#6-api-reference)
7. [Mobile Application](#7-mobile-application)
8. [Deployment — Railway](#8-deployment--railway)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Security](#10-security)
11. [User Guide](#11-user-guide)
12. [Appendix](#12-appendix)

---

## 1. Executive Summary

ClearWelth is a personal wealth management platform that enables users to track their complete financial picture — assets, liabilities, documents, and net worth — from a single mobile application.

The platform is built as a collection of independent backend microservices, each responsible for a specific domain of the application (users, assets, liabilities, etc.), communicating via a shared message bus. A React Native mobile app provides the user-facing experience, available on both iOS and Android via Expo.

### Key Features

- **Asset tracking** — cash savings, investments, property, pensions, vehicles, and other assets with live valuations (HM Land Registry for property, Yahoo Finance for investments, DVLA depreciation for vehicles)
- **Liability tracking** — short-term and long-term debts with interest rates and due dates
- **Net worth dashboard** — real-time calculation with trend charts and asset allocation breakdown
- **Document vault** — categorised, secure document storage linked to assets and liabilities with expiry alerts
- **Open banking** — connect bank accounts via TrueLayer to import live balances
- **Digital legacy** — nominate trusted contacts who can be granted delegated access
- **Financial services directory** — curated list of UK financial service providers (mortgages, pensions, insurance, etc.)
- **Security** — biometric lock, AES-256-GCM field encryption, JWT authentication, email verification

---

## 2. System Architecture

### 2.1 Overview

The platform follows a **microservices architecture**. Each service is a standalone Node.js/Express application with its own PostgreSQL database. Services communicate asynchronously via **RabbitMQ** (publish/subscribe) and synchronously over HTTP for direct data queries.

```
┌─────────────────────────────────────────────────────────────────┐
│                       Mobile App (Expo)                         │
│                   React Native — iOS & Android                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS REST
          ┌─────────────────┼──────────────────────┐
          │                 │                      │
    ┌─────▼──────┐   ┌──────▼──────┐   ┌──────────▼──────┐
    │  user-svc  │   │  asset-svc  │   │ liability-svc   │
    │  Port 3001 │   │  Port 3002  │   │   Port 3003     │
    │  userdb    │   │  assetdb    │   │  liabilitydb    │
    └────────────┘   └─────────────┘   └─────────────────┘
          │                 │                      │
          └─────────────────┼──────────────────────┘
                            │ RabbitMQ Events
          ┌─────────────────┼──────────────────────┐
          │                 │                      │
    ┌─────▼──────┐   ┌──────▼──────┐   ┌──────────▼──────┐
    │networth-sv │   │document-svc │   │  openbanking    │
    │ Port 3004  │   │  Port 3005  │   │   Port 3007     │
    │networthdb  │   │ documentdb  │   │ openbankingdb   │
    └────────────┘   └─────────────┘   └─────────────────┘
                            │
                    ┌───────▼───────┐
                    │ service-svc   │
                    │  Port 3006    │
                    │ (no database) │
                    └───────────────┘
```

### 2.2 Communication Patterns

| Pattern | Used For | Technology |
|---|---|---|
| REST over HTTPS | Mobile app → services | Axios (mobile), Express (services) |
| Service-to-service REST | networth-svc calls asset-svc + liability-svc | Axios |
| Async events | Data deletion, notifications | RabbitMQ (topic exchange) |

### 2.3 RabbitMQ Event Bus

All services connect to a shared topic exchange named `wealth_management_events`.

**Published events:**

| Service | Events Published |
|---|---|
| user-service | `user.registered`, `user.deleted`, `user.profile.updated` |
| asset-service | `asset.cash.added`, `asset.investment.added`, `asset.property.added`, `asset.updated`, `asset.deleted` |
| liability-service | `liability.short_term.added`, `liability.long_term.added`, `liability.updated`, `liability.deleted` |

**Subscriptions:**

| Service | Listens To | Purpose |
|---|---|---|
| asset-service | `user.#` | Delete all assets when user deleted |
| liability-service | `user.#` | Delete all liabilities when user deleted |
| document-service | `user.#`, `asset.#`, `liability.#` | Delete documents on parent deletion |
| networth-service | `asset.#`, `liability.#`, `user.#` | Invalidate cached calculations |
| openbanking-service | `user.#` | Delete bank connections when user deleted |

### 2.4 Database Design

Each service owns its own PostgreSQL database — no shared database connections between services.

| Service | Database | Key Tables |
|---|---|---|
| user-service | userdb | users, user_profiles, nominees, password_reset_tokens |
| asset-service | assetdb | assets (with JSONB metadata column) |
| liability-service | liabilitydb | liabilities |
| networth-service | networthdb | networth_snapshots |
| document-service | documentdb | documents (file stored as BYTEA) |
| openbanking-service | openbankingdb | bank_connections, auth_states |
| service-service | — | Static registry, no database |

---

## 3. Technology Stack

### 3.1 Backend Services

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20.x | Runtime for all services |
| Express | 4.18 | HTTP server framework |
| PostgreSQL | 15+ | Relational database per service |
| RabbitMQ | 3.x | Async message bus (via CloudAMQP in production) |
| JSON Web Tokens | 9.0 | Authentication tokens |
| bcrypt | 5.1 | Password hashing (12 rounds) |
| Helmet | 8.1 | HTTP security headers |
| express-rate-limit | 8.2 | API rate limiting |
| multer | 1.4 | File upload handling |
| pdfkit | 0.17 | Net worth report PDF generation |
| swagger-jsdoc + swagger-ui-express | 6.x / 5.x | OpenAPI documentation at `/api-docs` |
| amqplib | 0.10 | RabbitMQ client |
| Resend SDK | 6.x | Transactional email (verification, password reset) |
| yahoo-finance2 | 3.x | Live investment price quotes |
| dotenv | 17.x | Environment variable loading |

### 3.2 Mobile Application

| Technology | Version | Purpose |
|---|---|---|
| React Native | 0.81.5 | Cross-platform mobile framework |
| Expo SDK | 54 | Build toolchain and native APIs |
| React | 19.1 | UI component model |
| React Navigation | 7.x | Screen navigation (native stack + bottom tabs) |
| Axios | 1.x | HTTP client with auth interceptor |
| expo-secure-store | 15.x | Secure token storage (replaces AsyncStorage) |
| expo-local-authentication | 17.x | Biometric lock (Face ID / fingerprint) |
| expo-document-picker | 14.x | Pick files for document upload |
| expo-image-picker | 17.x | Pick images |
| expo-web-browser | 15.x | In-app browser for OAuth flows |
| react-native-svg | 15.x | SVG sparkline charts |
| react-native-safe-area-context | 5.x | Safe area insets |
| @react-native-community/datetimepicker | 8.x | Date pickers (DOB, expiry dates) |

### 3.3 Infrastructure & DevOps

| Technology | Purpose |
|---|---|
| Railway | Cloud hosting for all 7 backend services |
| GitHub Actions | CI/CD — parallel test runs on push/PR |
| CloudAMQP (Little Lemur) | Managed RabbitMQ in production |
| Resend | Transactional email delivery |
| TrueLayer | Open banking OAuth (sandbox mode) |
| HM Land Registry API | Free property valuation data |
| DVLA API | Vehicle registration lookups (key pending) |
| Nixpacks | Build system used by Railway |
| Jest + Supertest | Unit and integration tests |
| Swagger / OpenAPI 3.0 | API documentation |

---

## 4. Local Development Setup

### 4.1 Prerequisites

Install the following before proceeding:

- **Node.js** v20 or higher — https://nodejs.org
- **PostgreSQL** v15 or higher — https://www.postgresql.org/download
- **RabbitMQ** — https://www.rabbitmq.com/download.html (or run via Docker)
- **Expo Go** — install on your iOS or Android device from the App Store / Google Play
- **Git**

### 4.2 Clone the Repository

```bash
git clone https://github.com/kofipa/wealth-management-microservices.git
cd wealth-management-microservices
```

### 4.3 Database Setup

Connect to PostgreSQL and create a database for each service:

```sql
CREATE DATABASE userdb;
CREATE DATABASE assetdb;
CREATE DATABASE liabilitydb;
CREATE DATABASE networthdb;
CREATE DATABASE documentdb;
CREATE DATABASE openbankingdb;
```

Each service automatically creates its own tables on first start via `initDB()` in `app.js`.

Default local credentials used across all services:
- **Host:** localhost
- **Port:** 5432
- **User:** postgres
- **Password:** postgres123

### 4.4 Environment Variables

Each service requires a `.env` file in its root directory (`services/<name>/.env`). Create one for each service using the template below.

> **Important:** All services must share the same `JWT_SECRET`. If they differ, tokens will fail to verify across services and users will be logged out immediately.

#### user-service `.env`

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=userdb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<64-char hex secret — same across all services>
FIELD_ENCRYPTION_KEY=<64-char hex secret for PII encryption>
RESEND_API_KEY=<your Resend API key>
FROM_EMAIL=noreply@clearwelth.com
APP_URL=http://192.168.0.6:3001
ALLOWED_ORIGINS=
```

#### asset-service `.env`

```env
PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=assetdb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
DVLA_API_KEY=
ALLOWED_ORIGINS=
```

#### liability-service `.env`

```env
PORT=3003
DB_HOST=localhost
DB_PORT=5432
DB_NAME=liabilitydb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
ALLOWED_ORIGINS=
```

#### networth-service `.env`

```env
PORT=3004
DB_HOST=localhost
DB_PORT=5432
DB_NAME=networthdb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
ASSET_SERVICE_URL=http://localhost:3002
LIABILITY_SERVICE_URL=http://localhost:3003
ALLOWED_ORIGINS=
```

#### document-service `.env`

```env
PORT=3005
DB_HOST=localhost
DB_PORT=5432
DB_NAME=documentdb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
ALLOWED_ORIGINS=
```

#### service-service `.env`

```env
PORT=3006
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
USER_SERVICE_URL=http://localhost:3001
ASSET_SERVICE_URL=http://localhost:3002
LIABILITY_SERVICE_URL=http://localhost:3003
NETWORTH_SERVICE_URL=http://localhost:3004
DOCUMENT_SERVICE_URL=http://localhost:3005
ALLOWED_ORIGINS=
```

#### openbanking-service `.env`

```env
PORT=3007
DB_HOST=localhost
DB_PORT=5432
DB_NAME=openbankingdb
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost
JWT_SECRET=<same secret>
TRUELAYER_CLIENT_ID=sandbox-kpagroupbank-e9de69
TRUELAYER_CLIENT_SECRET=<your TrueLayer secret>
TRUELAYER_REDIRECT_URI=http://192.168.0.6:3007/api/openbanking/callback
ALLOWED_ORIGINS=
```

### 4.5 Starting the Services

Open a separate terminal for each service:

```bash
# Terminal 1
cd services/user-service && npm install && npm start

# Terminal 2
cd services/asset-service && npm install && npm start

# Terminal 3
cd services/liability-service && npm install && npm start

# Terminal 4
cd services/networth-service && npm install && npm start

# Terminal 5
cd services/document-service && npm install && npm start

# Terminal 6
cd services/service-service && npm install && npm start

# Terminal 7
cd services/openbanking-service && npm install && npm start
```

Verify all services are running:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
curl http://localhost:3006/health
curl http://localhost:3007/health
```

Each should return `{ "status": "ok" }`.

### 4.6 Starting the Mobile App

1. Find your local machine's IP address (e.g. `192.168.0.6`)
2. Open `mobile/src/api/config.js` and set:
   ```js
   const IS_PRODUCTION = false;
   const DEV_HOST = '192.168.0.6'; // replace with your IP
   ```
3. Start the Expo development server:
   ```bash
   cd mobile
   npm install
   npx expo start --tunnel
   ```
4. Scan the QR code with the Expo Go app on your phone

### 4.7 Running Tests

Each service has a Jest test suite:

```bash
cd services/user-service && npm test
cd services/asset-service && npm test
# etc.
```

> Note: Tests mock external dependencies (database, RabbitMQ). No running infrastructure is needed for tests.

---

## 5. Service Reference

### 5.1 User Service

**Port:** 3001 | **Database:** userdb

Handles user registration, authentication, profile management, email verification, password resets, and digital legacy (trusted contacts / nominees).

#### Database Schema

```
users
  id            UUID PRIMARY KEY
  email         VARCHAR(255) UNIQUE NOT NULL
  password_hash VARCHAR(255) NOT NULL
  email_verified BOOLEAN DEFAULT false
  verification_token VARCHAR(64)
  token_expiry  TIMESTAMP
  pending_email VARCHAR(255)
  created_at    TIMESTAMP
  updated_at    TIMESTAMP

user_profiles
  id            UUID PRIMARY KEY
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE
  first_name    VARCHAR(100)
  last_name     VARCHAR(100)
  phone         TEXT  (AES-256-GCM encrypted)
  date_of_birth TEXT  (AES-256-GCM encrypted)
  address       TEXT  (AES-256-GCM encrypted)
  security_question TEXT
  security_answer_hash TEXT

nominees
  id            UUID PRIMARY KEY
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE
  name          VARCHAR(255)
  email         VARCHAR(255)
  relationship  VARCHAR(100)

password_reset_tokens
  id            UUID PRIMARY KEY
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE
  reset_code    VARCHAR(6)
  expires_at    TIMESTAMP
```

#### Security Configuration

- **Rate limits:** Login (50/15 min), Register (10/hr), Forgot Password (5/hr), Reset Password (5/15 min), Resend Verification (3/15 min)
- **PII Encryption:** `phone`, `date_of_birth`, and `address` are encrypted at rest using AES-256-GCM with a 256-bit key (`FIELD_ENCRYPTION_KEY`)
- **Password policy:** Minimum 10 characters; common passwords blocked

---

### 5.2 Asset Service

**Port:** 3002 | **Database:** assetdb

Manages all user assets. Assets are stored in a single `assets` table with a JSONB `metadata` column that holds type-specific fields.

#### Asset Types & Metadata

| Type | Route | Metadata Fields |
|---|---|---|
| cash | `/api/assets/cash` | institution, account_type, interest_rate |
| investment | `/api/assets/investment` | platform, investment_type, ticker, quantity, purchase_price, date |
| property | `/api/assets/property` | address, property_type, purchase_price, date, has_mortgage, mortgage_liability_id |
| pension | `/api/assets/pension` | provider, pension_type, contribution_type, employee_contribution_pct, employer_contribution_pct, policy_reference |
| vehicle | `/api/assets/other` | original_type: 'vehicle', reg_plate, purchase_price, date, has_finance, finance_liability_id |
| other | `/api/assets/other` | category, purchase_price, date |

> **Note:** Vehicles and other assets share the `/api/assets/other` route. Vehicles are distinguished by `metadata.original_type = 'vehicle'`.

#### Live Valuation Integrations

| Integration | Endpoint | Cache | Notes |
|---|---|---|---|
| HM Land Registry | `GET /api/assets/valuation/property?postcode=` | 24 hours | Median of last 24 months' sold prices |
| Yahoo Finance | `GET /api/assets/price/quote?ticker=` | 15 minutes | LSE tickers require `.L` suffix (e.g. `VWRP.L`) |
| DVLA + Depreciation | `GET /api/assets/valuation/vehicle?reg=&purchase_price=&purchase_date=` | 24 hours | 15%/yr compound depreciation, floor at 10% |

#### Linked Liability Sync

When creating or editing a property or vehicle asset, the service automatically creates, updates, or deletes associated liabilities:

- **Property with mortgage** → creates a long-term liability; `mortgage_liability_id` stored in asset metadata
- **Vehicle with finance** → creates a short-term or long-term liability depending on finance type; `finance_liability_id` stored in metadata

---

### 5.3 Liability Service

**Port:** 3003 | **Database:** liabilitydb

Tracks short-term and long-term financial obligations.

#### Liability Types

| Type | Route | Examples |
|---|---|---|
| short_term | `/api/liabilities/short-term` | Credit cards, short-term loans, monthly insurance |
| long_term | `/api/liabilities/long-term` | Mortgages, vehicle finance, long-term loans |

> **Important:** The database stores `short_term` and `long_term` with **underscores**. The POST routes use **hyphens** (`short-term`, `long-term`). These are intentionally different.

#### Fields

| Field | Type | Notes |
|---|---|---|
| name | VARCHAR(255) | Required, max 255 chars |
| amount | DECIMAL | Required, in GBP |
| interest_rate | DECIMAL | Optional, percentage |
| due_date | DATE | Optional |
| description | VARCHAR(500) | Optional |

---

### 5.4 Net Worth Service

**Port:** 3004 | **Database:** networthdb

Aggregates data from the asset and liability services to calculate net worth. Does not store assets or liabilities directly — all data is fetched live and a daily snapshot is saved.

#### Calculation Logic

```
Net Worth = Total Assets − Total Liabilities
```

Each call to `/calculate` or `/breakdown` upserts a row into `networth_snapshots` with a `UNIQUE(user_id, snapshot_date)` constraint, ensuring one snapshot per user per day.

#### Snapshot Schema

```
networth_snapshots
  id              UUID PRIMARY KEY
  user_id         UUID
  net_worth       DECIMAL
  total_assets    DECIMAL
  total_liabilities DECIMAL
  snapshot_date   DATE
  created_at      TIMESTAMP
```

> **Production requirement:** `ASSET_SERVICE_URL` and `LIABILITY_SERVICE_URL` must be set to Railway HTTPS URLs. Without these, the service falls back to internal Docker hostnames that do not exist in Railway.

---

### 5.5 Document Service

**Port:** 3005 | **Database:** documentdb

Stores user documents securely as binary data (BYTEA) in PostgreSQL. Documents can be associated with specific assets or liabilities.

#### Supported File Types

| Type | MIME Types |
|---|---|
| PDF | application/pdf |
| Images | image/jpeg, image/png, image/gif, image/webp |
| Word | application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| Excel | application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| Text / CSV | text/plain, text/csv |

**Maximum file size:** 10MB

#### Document Categories

`identity` | `property` | `insurance` | `investments` | `banking` | `tax` | `legal` | `other`

When uploading from the asset form, the category is set automatically based on asset type (e.g. cash → banking, property → property).

#### Expiry Tracking

Documents can have an optional `expiry_date`. The mobile app shows:
- **Red "Expired" badge** — document has passed its expiry date
- **Orange "Exp soon" badge** — document expires within 30 days

---

### 5.6 Service Registry

**Port:** 3006 | **Database:** None

A static registry of all platform services with live health checking. Used by the mobile app's Services screen to show which services are currently reachable.

#### Registered Services

| Name | Default URL | Description |
|---|---|---|
| user-service | USER_SERVICE_URL | User authentication and profile management |
| asset-service | ASSET_SERVICE_URL | Manage assets (cash, investments, property) |
| liability-service | LIABILITY_SERVICE_URL | Track short and long-term liabilities |
| networth-service | NETWORTH_SERVICE_URL | Calculate net worth from assets and liabilities |
| document-service | DOCUMENT_SERVICE_URL | Upload and manage supporting documents |

> **Production:** Set all `*_SERVICE_URL` environment variables to the clearwelth.com custom domain URLs. Without them, the service defaults to internal Docker hostnames and all health checks return DOWN.

---

### 5.7 Open Banking Service

**Port:** 3007 | **Database:** openbankingdb

Integrates with TrueLayer's Open Banking API to allow users to connect their bank accounts and import live account balances as cash assets.

#### OAuth Flow

```
1. Mobile app calls GET /api/openbanking/auth-url
   → returns TrueLayer authorization URL + state token

2. Mobile app opens URL in in-app browser (expo-web-browser)
   → user logs in to their bank in TrueLayer sandbox

3. TrueLayer redirects to TRUELAYER_REDIRECT_URI with ?code=&state=
   → service exchanges code for access + refresh tokens
   → tokens stored in bank_connections table

4. Mobile app polls GET /api/openbanking/status
   → once tokens exist, poll returns success

5. User selects accounts to import via POST /api/openbanking/import-account
   → creates cash assets in asset-service
```

#### Token Management

- Access tokens are automatically refreshed if they expire within 60 seconds
- Auth states older than 10 minutes are automatically cleaned up
- One bank connection per user (UNIQUE constraint on user_id)

> **Note:** TrueLayer production credentials (FCA authorisation) are pending. The service currently runs in sandbox mode only.

---

## 6. API Reference

All endpoints (except `/health` and public auth endpoints) require a JWT Bearer token:

```
Authorization: Bearer <token>
```

Tokens are obtained from `POST /api/users/login` and are valid for 7 days.

### 6.1 Authentication Endpoints (user-service — port 3001)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/users/register` | No | Register new account |
| POST | `/api/users/login` | No | Login, returns `{ token, userId, email }` |
| POST | `/api/users/logout` | Yes | Logout (client-side token discard) |
| GET | `/api/users/verify-email?token=` | No | Verify email address |
| POST | `/api/users/resend-verification` | No | Resend verification email |
| POST | `/api/users/forgot-password` | No | Send 6-digit reset code via email |
| POST | `/api/users/reset-password` | No | Reset password with code |
| POST | `/api/users/change-password` | Yes | Change password (requires current password) |
| GET | `/api/users/security-question/:email` | No | Get security question for email |
| POST | `/api/users/verify-security-question` | No | Verify answer, returns reset token |
| POST | `/api/users/security-question` | Yes | Set/update security question |
| GET | `/api/users/me` | Yes | Get current user profile |
| PUT | `/api/users/profile` | Yes | Update profile (name, phone, DOB, address) |
| POST | `/api/users/change-email` | Yes | Request email change (sends verification) |
| DELETE | `/api/users/me` | Yes | Delete account (requires password) |
| GET | `/health` | No | Service health check |

#### Register Request

```json
POST /api/users/register
{
  "email": "jane@example.com",
  "password": "SecurePass123!",
  "first_name": "Jane",
  "last_name": "Smith"
}
```

#### Login Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "uuid-here",
  "email": "jane@example.com"
}
```

> **Note:** Registration does not auto-login. The user must verify their email first, then log in manually. A 403 response with `{ "unverified": true }` is returned if the email is not yet verified.

---

### 6.2 Asset Endpoints (asset-service — port 3002)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/assets/cash` | Yes | Add cash / savings asset |
| POST | `/api/assets/investment` | Yes | Add investment asset |
| POST | `/api/assets/property` | Yes | Add property asset |
| POST | `/api/assets/pension` | Yes | Add pension asset |
| POST | `/api/assets/other` | Yes | Add vehicle or other asset |
| GET | `/api/assets` | Yes | List all assets for user |
| GET | `/api/assets/:id` | Yes | Get single asset |
| PUT | `/api/assets/:id` | Yes | Update asset (including metadata) |
| DELETE | `/api/assets/:id` | Yes | Delete asset |
| GET | `/api/assets/valuation/property?postcode=` | Yes | HM Land Registry valuation |
| GET | `/api/assets/valuation/vehicle?reg=&purchase_price=&purchase_date=` | Yes | Vehicle depreciation estimate |
| GET | `/api/assets/price/quote?ticker=` | Yes | Live investment price quote |
| GET | `/health` | No | Service health check |

#### Add Investment Asset — Example Request

```json
POST /api/assets/investment
{
  "name": "Vanguard FTSE All-World",
  "value": 12500.00,
  "description": "ISA investment",
  "metadata": {
    "platform": "Vanguard",
    "investment_type": "ETF",
    "ticker": "VWRP.L",
    "quantity": 85,
    "purchase_price": 95.50,
    "date": "2023-01-15"
  }
}
```

---

### 6.3 Liability Endpoints (liability-service — port 3003)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/liabilities/short-term` | Yes | Add short-term liability |
| POST | `/api/liabilities/long-term` | Yes | Add long-term liability |
| GET | `/api/liabilities` | Yes | List all liabilities for user |
| GET | `/api/liabilities/:id` | Yes | Get single liability |
| PUT | `/api/liabilities/:id` | Yes | Update liability |
| DELETE | `/api/liabilities/:id` | Yes | Delete liability |
| GET | `/health` | No | Service health check |

---

### 6.4 Net Worth Endpoints (networth-service — port 3004)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/networth/calculate` | Yes | Calculate and return net worth total |
| GET | `/api/networth/breakdown` | Yes | Full breakdown by asset/liability type |
| GET | `/api/networth/history?days=30` | Yes | Historical snapshots (ascending) |
| GET | `/health` | No | Service health check |

#### Breakdown Response — Example

```json
{
  "net_worth": 245000.00,
  "total_assets": 285000.00,
  "total_liabilities": 40000.00,
  "assets_by_type": {
    "cash": 15000,
    "investment": 22000,
    "property": 240000,
    "pension": 8000
  },
  "liabilities_by_type": {
    "long_term": 38000,
    "short_term": 2000
  }
}
```

---

### 6.5 Document Endpoints (document-service — port 3005)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/documents/upload` | Yes | Upload document (multipart/form-data) |
| GET | `/api/documents` | Yes | List documents (optional `?category=`) |
| GET | `/api/documents/:id` | Yes | Get document metadata |
| GET | `/api/documents/:id/download` | Yes | Download document file |
| PUT | `/api/documents/:id` | Yes | Update document metadata |
| DELETE | `/api/documents/:id` | Yes | Delete document |
| GET | `/health` | No | Service health check |

#### Upload Request Fields (multipart/form-data)

| Field | Required | Description |
|---|---|---|
| `file` | Yes | The document file |
| `description` | No | Free-text description |
| `category` | No | One of the 8 category values |
| `related_entity_type` | No | `asset`, `liability`, or `general` |
| `related_entity_id` | No | UUID of the linked asset/liability |
| `expiry_date` | No | ISO date string (YYYY-MM-DD) |

---

### 6.6 Open Banking Endpoints (openbanking-service — port 3007)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/openbanking/auth-url` | Yes | Get TrueLayer authorization URL |
| GET | `/api/openbanking/callback?code=&state=` | No | OAuth callback (server-side) |
| GET | `/api/openbanking/accounts` | Yes | List connected bank accounts |
| POST | `/api/openbanking/import-account` | Yes | Import account as cash asset |
| GET | `/health` | No | Service health check |

---

### 6.7 Swagger / API Documentation

Each service exposes interactive API documentation at:

```
http://localhost:<port>/api-docs
```

> Authentication is required to access the Swagger UI. Provide a valid JWT via the Authorize button (Bearer token format).

---

## 7. Mobile Application

### 7.1 Overview

The ClearWelth mobile app is built with **React Native** and **Expo SDK 54**, running on both iOS and Android. It communicates exclusively with the backend services over HTTPS.

### 7.2 Screen Structure

```
App
├── Auth Stack (unauthenticated)
│   ├── Login
│   ├── Register
│   ├── ForgotPassword
│   └── EmailSent
│
└── App Stack (authenticated)
    ├── Onboarding (shown once on first launch)
    ├── Main Tabs
    │   ├── Dashboard
    │   ├── Assets
    │   ├── Liabilities
    │   ├── Documents
    │   └── Services
    ├── Profile (accessible from header icon)
    └── PrivacySecurity (accessible from Profile)
```

### 7.3 Screen Descriptions

#### Dashboard
The home screen showing a complete financial summary:
- Net worth figure with monthly change indicator
- SVG sparkline trend chart (30-day history)
- Asset allocation horizontal bar chart (by type, colour-coded)
- Liability breakdown bar chart
- Portfolio performance chart (current value vs purchase cost)
- "Recommended for you" carousel — personalised financial service suggestions (rotates every 4 seconds)

#### Assets
- Full list of all assets with search bar and sort chips (Value ↓/↑, Name, Type)
- Live valuations auto-loaded on screen open (property postcode, investment ticker, vehicle reg)
- Add / Edit / Delete assets via modal form
- Type-specific metadata fields shown per asset type
- Document attachment from the asset form
- Mortgage and vehicle finance auto-created/updated/deleted as linked liabilities
- Connect bank account (TrueLayer open banking)

#### Liabilities
- Full list of liabilities with search and sort
- Red-themed UI to distinguish from assets
- Add / Edit / Delete via modal form with field validation (red borders on missing required fields)

#### Documents
- Categorised document library with filter chips
- Upload modal with category picker, expiry date picker, and entity linkage
- Expiry badges on cards (red Expired / orange Expiring Soon)
- Download and share documents

#### Services
- Directory of UK financial service providers in 8 categories
- Providers: Wills, Mortgages, Loans, Life Insurance, Investments, Pensions, Tax, Income Protection
- Link-checking on open (broken providers hidden automatically)
- User email/name pre-filled in provider URLs
- After visiting Life Insurance / Income Protection, prompted to log monthly premium as a liability
- "Recommended for you" section personalised to user's asset profile

#### Profile
- Display and edit personal details (name, phone, date of birth, address)
- Change password
- Change email (sends verification to new address)
- Security question management
- Biometric lock toggle (Face ID / fingerprint)
- Dark mode toggle
- Trusted contacts / nominees management (digital legacy)
- Service health accordion (shows all service statuses)
- Privacy & Security (full GDPR-compliant privacy policy)
- Delete account (permanent, requires password confirmation)

### 7.4 Authentication Flow

```
Register → Email sent → User verifies email → Login → Dashboard
```

- Tokens are stored in `expo-secure-store` (encrypted native storage)
- A 401 or 403 response from any service automatically logs the user out
- After 5+ minutes in the background with biometrics enabled, the app locks with a biometric prompt on return

### 7.5 Switching Between Local and Production

Open `mobile/src/api/config.js`:

```js
// For local development:
const IS_PRODUCTION = false;

// For production (Railway):
const IS_PRODUCTION = true;
```

### 7.6 Onboarding

First-time users see a 3-slide onboarding wizard explaining the app's features. The flag `onboardingDone` is stored in SecureStore and the wizard is never shown again after completion.

### 7.7 Dark Mode

A full dark mode is available, toggled from Profile. The preference is persisted to SecureStore. The app follows the system theme by default; manual override is stored and applied immediately.

---

## 8. Deployment — Railway

### 8.1 Overview

All 7 backend services are deployed on **Railway** (Hobby plan). Each service is a separate Railway service with auto-deploy connected to the `master` branch on GitHub. Any push to `master` triggers an automatic redeploy of all services.

### 8.2 Production URLs

| Service | Railway Name | Production URL |
|---|---|---|
| user-service | wealth-management | user.api.clearwelth.com |
| asset-service | devoted-art | asset.api.clearwelth.com |
| liability-service | exemplary-curiosity | liability.api.clearwelth.com |
| networth-service | victorious-laughter | networth.api.clearwelth.com |
| document-service | robust-dedication | document.api.clearwelth.com |
| openbanking-service | daring-embrace | openbanking.api.clearwelth.com |
| service-service | brave-harmony | services.api.clearwelth.com |

### 8.3 Railway Configuration Per Service

Each service uses a `railway.toml` file in its directory:

```toml
[build]
buildCommand = "npm install --production"

[deploy]
startCommand = "node src/app.js"
```

**Root Directory** in Railway Settings is set to `services/<name>` for each service.

### 8.4 Environment Variables in Railway

Variables are set per service via the Railway dashboard. Database variables use Railway's reference syntax to pull from the attached Postgres instance:

```
DB_HOST     = ${{Postgres.PGHOST}}
DB_PORT     = ${{Postgres.PGPORT}}
DB_NAME     = ${{Postgres.PGDATABASE}}
DB_USER     = ${{Postgres.PGUSER}}
DB_PASSWORD = ${{Postgres.PGPASSWORD}}
```

Additional variables (same across all services):

```
JWT_SECRET          = <64-char hex>
RABBITMQ_URL        = amqps://<cloudamqp-url>
ALLOWED_ORIGINS     = https://clearwelth.com
```

### 8.5 RabbitMQ in Production

RabbitMQ is provided by **CloudAMQP** (Little Lemur free tier, Singapore region). The connection string is in AMQPS format:

```
amqps://username:password@armadillo.rmq.cloudamqp.com/vhost
```

### 8.6 Custom Domain SSL

Custom domains are managed via Names.co.uk. DNS is configured with:
- **CNAME** record pointing to the Railway-provided hostname
- **TXT** record for domain ownership verification

SSL certificates are provisioned automatically by Railway within ~10 minutes of DNS propagation.

### 8.7 Deploying Changes

1. Make changes locally
2. Commit and push to `master`:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin master
   ```
3. Railway auto-deploys all services within ~2 minutes
4. After backend redeploy, reload the Expo bundle on device (shake → Reload, or `npx expo start --tunnel --clear`) for mobile changes

---

## 9. CI/CD Pipeline

### 9.1 Overview

GitHub Actions runs automated tests on every push and pull request to `master`. Six jobs run in **parallel**, one per service.

**Workflow file:** `.github/workflows/ci.yml`

### 9.2 Test Jobs

| Job | Service | Additional Env Vars |
|---|---|---|
| test-user-service | user-service | JWT_SECRET, FIELD_ENCRYPTION_KEY, DB_*, RABBITMQ_URL, RESEND_API_KEY |
| test-asset-service | asset-service | JWT_SECRET |
| test-liability-service | liability-service | JWT_SECRET |
| test-networth-service | networth-service | JWT_SECRET |
| test-document-service | document-service | JWT_SECRET |
| test-service-service | service-service | JWT_SECRET |

### 9.3 Test Configuration

- **Runtime:** ubuntu-latest, Node.js 18
- **Install:** `npm ci` (reproducible installs from lock file)
- **Run:** `npm test -- --forceExit`
- **Mocking:** Tests mock PostgreSQL and RabbitMQ — no live infrastructure needed in CI
- **Total tests:** 67 across all services

### 9.4 Test Coverage Areas

| Service | Tests Cover |
|---|---|
| user-service | Register, login, email verification, password reset, profile CRUD, security questions, account deletion |
| asset-service | CRUD for all asset types, metadata handling, valuation endpoints |
| liability-service | CRUD for short-term and long-term liabilities, input validation |
| networth-service | Calculate, breakdown, history endpoints |
| document-service | Upload, download, list, delete, category filtering |
| service-service | Service list, health check aggregation |

---

## 10. Security

### 10.1 Authentication

- **JWT (RS256-style HMAC)** with a 64-character hex secret shared across all services
- Token expiry: 7 days
- Tokens stored in `expo-secure-store` on device (not AsyncStorage)
- Automatic logout on 401/403 from any service

### 10.2 Password Security

- Minimum 10 characters
- Common passwords blocked (blocklist enforced)
- Hashed with **bcrypt** at cost factor 12
- Current password required to change password or delete account

### 10.3 PII Encryption

Sensitive profile fields (`phone`, `date_of_birth`, `address`) are encrypted at the application layer before being written to the database, using **AES-256-GCM** (Node.js built-in `crypto`). A 256-bit `FIELD_ENCRYPTION_KEY` is required in the user-service environment.

### 10.4 Email Verification

All new accounts require email verification before login is permitted. The verification link expires after 24 hours. Email changes require re-verification at the new address.

### 10.5 API Security

- **Helmet** — sets secure HTTP headers on all services
- **CORS** — restricted to `ALLOWED_ORIGINS` in production
- **Rate limiting** — on all sensitive user-service endpoints
- **Input validation** — name and description fields have length limits enforced server-side
- **MIME type whitelist** — document uploads restricted to approved file types

### 10.6 Biometric Lock

When enabled, the app locks itself after 5 minutes in the background and requires Face ID or fingerprint authentication to resume.

### 10.7 GDPR Compliance

- Users can download their data (via profile)
- Users can permanently delete their account and all associated data via `DELETE /api/users/me`
- Deletion cascades to assets, liabilities, documents, bank connections, and net worth history via RabbitMQ events
- Full privacy policy available in-app at Profile → Privacy & Security
- Data controller: clearwelth.com | Contact: privacy@clearwelth.com

---

## 11. User Guide

### 11.1 Getting Started

#### Creating an Account

1. Open the ClearWelth app
2. Tap **Register**
3. Enter your first name, last name, email address, and a password (minimum 10 characters)
4. Tap **Create Account**
5. Check your email inbox for a verification link from noreply@clearwelth.com
6. Tap the link to verify your email
7. Return to the app and **Log In**

#### First-Time Setup

On your first login you will see a 3-step onboarding guide explaining the main features. After completing it you will land on the Dashboard.

---

### 11.2 Adding Assets

1. Tap the **Assets** tab (bottom navigation)
2. Tap **+ Add** in the top right
3. Enter a name for the asset
4. Select the asset type (Cash, Investment, Property, Pension, Vehicle, Other)
5. Enter the current value in GBP
6. Fill in any type-specific fields that appear (e.g. ticker symbol for investments, address for property)
7. Optionally attach a document (e.g. bank statement, investment report)
8. Tap **Save**

> **Tip:** For investment assets with a ticker symbol, the app will automatically look up the current market price and update the value.

> **Tip:** For property assets, enter the full postcode in the address field. The app will look up recent sold prices from HM Land Registry to suggest a current valuation.

---

### 11.3 Adding Liabilities

1. Tap the **Liabilities** tab
2. Tap **+ Add**
3. Enter a name and select the type:
   - **Short-Term** — credit cards, overdrafts, short-term loans
   - **Long-Term** — mortgages, vehicle finance, long-term loans
4. Enter the outstanding amount in GBP
5. Optionally add an interest rate and due date
6. Tap **Save**

> **Note:** Mortgages and vehicle finance can be created automatically when you add a property or vehicle asset with the mortgage/finance options enabled.

---

### 11.4 Uploading Documents

1. Tap the **Documents** tab
2. Tap the **+** button or **Upload Document**
3. Select a file from your device (PDF, image, Word, Excel, or text file — max 10MB)
4. Choose a category (e.g. Banking, Property, Insurance)
5. Optionally set an expiry date (for passports, insurance certificates, etc.)
6. Tap **Upload**

> **Tip:** Documents can also be uploaded directly from the Asset form — tap "Attach Document" when adding or editing an asset.

---

### 11.5 Connecting Your Bank Account

1. Go to the **Assets** tab
2. Tap **Connect Bank Account**
3. You will be taken to a secure TrueLayer login page
4. Select your bank and log in with your online banking credentials
5. Return to the app and select which accounts to import
6. Tap **Import Selected** — the balances will appear as cash assets

> **Note:** The open banking feature is currently in sandbox (test) mode. Real bank connections require FCA authorisation which is pending.

---

### 11.6 Understanding the Dashboard

| Section | What It Shows |
|---|---|
| Net Worth | Total assets minus total liabilities, with monthly change |
| Trend Chart | 30-day sparkline of net worth history |
| Asset Allocation | Horizontal bar chart showing proportion by asset type |
| Liability Breakdown | Bar chart showing short-term vs long-term debt |
| Portfolio Performance | Comparison of current value vs original purchase cost |
| Recommended for You | Personalised suggestions for financial services |

---

### 11.7 Finding Financial Services

1. Tap the **Services** tab
2. Browse by category (Mortgages, Pensions, Life Insurance, etc.)
3. Tap a category to see recommended UK providers
4. Tap a provider to open their website in the in-app browser

> **Tip:** After visiting a Life Insurance or Income Protection provider, the app will ask if you'd like to log your monthly premium as a liability — keeping your financial picture complete.

---

### 11.8 Profile & Settings

From any screen, tap the **person icon** in the top right to access your profile.

| Setting | Location |
|---|---|
| Edit personal details | Profile → Edit Profile |
| Change password | Profile → Security → Change Password |
| Change email | Profile → Security → Change Email |
| Set security question | Profile → Security → Security Question |
| Enable biometric lock | Profile → Security → Biometric Lock (toggle) |
| Enable dark mode | Profile → Security → Dark Mode (toggle) |
| Add trusted contacts | Profile → Trusted Contacts |
| View service health | Profile → Service Health (expandable) |
| Privacy policy | Profile → Privacy & Security |
| Delete account | Profile → Delete Account (at the bottom) |

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|---|---|
| Microservice | A small, independently deployable service responsible for a single business domain |
| JWT | JSON Web Token — a signed token used to authenticate API requests |
| RabbitMQ | An open-source message broker used to pass events between services asynchronously |
| JSONB | A PostgreSQL data type for storing JSON data with indexing support |
| AMQP | Advanced Message Queuing Protocol — the protocol used by RabbitMQ |
| AES-256-GCM | Advanced Encryption Standard with a 256-bit key in Galois/Counter Mode — used for PII encryption |
| TrueLayer | A UK open banking provider that enables connecting bank accounts via secure OAuth |
| Expo | A framework and platform for building React Native apps |
| Railway | A cloud platform-as-a-service provider used to host the backend services |
| Nixpacks | An automatic build system used by Railway to detect and build Node.js applications |
| PII | Personally Identifiable Information (e.g. phone number, date of birth, address) |
| GDPR | General Data Protection Regulation — UK/EU data protection law |
| ISA | Individual Savings Account — a UK tax-free savings/investment wrapper |
| SIPP | Self-Invested Personal Pension — a UK pension with flexible investment choices |
| DC / DB | Defined Contribution / Defined Benefit pension types |

### 12.2 Environment Variable Reference

| Variable | Services | Description |
|---|---|---|
| `JWT_SECRET` | All | 64-char hex secret for signing JWTs. Must be identical across all services. |
| `FIELD_ENCRYPTION_KEY` | user-service | 64-char hex key for AES-256-GCM PII encryption |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | All (except service-service) | PostgreSQL connection details |
| `RABBITMQ_URL` | All | AMQP/AMQPS connection string |
| `RESEND_API_KEY` | user-service | API key for Resend email delivery |
| `FROM_EMAIL` | user-service | Sender address (noreply@clearwelth.com) |
| `APP_URL` | user-service | Base URL for email verification links |
| `ALLOWED_ORIGINS` | All | Comma-separated CORS origins. Empty = allow all. |
| `ASSET_SERVICE_URL` | networth-service, service-service | URL of the asset service |
| `LIABILITY_SERVICE_URL` | networth-service, service-service | URL of the liability service |
| `NETWORTH_SERVICE_URL` | service-service | URL of the net worth service |
| `USER_SERVICE_URL` | service-service | URL of the user service |
| `DOCUMENT_SERVICE_URL` | service-service | URL of the document service |
| `DVLA_API_KEY` | asset-service | DVLA vehicle lookup API key (optional) |
| `TRUELAYER_CLIENT_ID` | openbanking-service | TrueLayer OAuth client ID |
| `TRUELAYER_CLIENT_SECRET` | openbanking-service | TrueLayer OAuth client secret |
| `TRUELAYER_REDIRECT_URI` | openbanking-service | OAuth callback URL (must match TrueLayer Console) |

### 12.3 Port Reference

| Service | Local Port |
|---|---|
| user-service | 3001 |
| asset-service | 3002 |
| liability-service | 3003 |
| networth-service | 3004 |
| document-service | 3005 |
| service-service | 3006 |
| openbanking-service | 3007 |

> **Railway note:** Railway exposes services on port 8080 internally. Set the `PORT` variable to `8080` in Railway's Networking settings per service.

### 12.4 Pending Items

The following items are noted for completion before a full public launch:

| Item | Details |
|---|---|
| TrueLayer production credentials | FCA authorisation pending. Current open banking is sandbox only. |
| DVLA API key | Apply at developer-portal.driver-vehicle-licensing.api.gov.uk |
| ICO registration | Required under UK GDPR. £40/year at ico.org.uk. Register before public launch. |

### 12.5 Converting This Document to PDF

This document is written in Markdown. To convert to PDF, use **Pandoc**:

```bash
# Install Pandoc: https://pandoc.org/installing.html
# Install a LaTeX distribution (e.g. MiKTeX on Windows, MacTeX on macOS)

pandoc docs/wealth-management-documentation.md \
  -o docs/wealth-management-documentation.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=2cm \
  -V fontsize=11pt \
  -V mainfont="DejaVu Serif"
```

Alternatively, open the Markdown file in **VS Code** and use the **Markdown PDF** extension (right-click → Export as PDF).

---

*ClearWelth — clearwelth.com | privacy@clearwelth.com*
