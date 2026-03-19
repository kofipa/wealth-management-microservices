# Clearwelth — Wealth Management Microservices

A full-stack personal wealth management platform built with Node.js microservices and a React Native mobile app.

## Architecture

7 independent Node.js/Express microservices, each with its own PostgreSQL database, communicating via RabbitMQ. Hosted on Railway. Mobile app built with React Native + Expo SDK 54.

### Services

| Service | Local Port | Production URL | Database |
|---|---|---|---|
| user-service | 3001 | user.api.clearwelth.com | userdb |
| asset-service | 3002 | asset.api.clearwelth.com | assetdb |
| liability-service | 3003 | liability.api.clearwelth.com | liabilitydb |
| networth-service | 3004 | networth.api.clearwelth.com | networthdb |
| document-service | 3005 | document.api.clearwelth.com | documentdb |
| openbanking-service | 3007 | openbanking.api.clearwelth.com | openbankingdb |
| service-service | 3006 | services.api.clearwelth.com | — |

### Event-Driven Communication

Services communicate via RabbitMQ topic exchange. Key events:
- `user.registered`, `user.deleted`
- `asset.cash.added`, `asset.investment.added`, `asset.property.added`, `asset.pension.added`, `asset.other.added`, `asset.updated`, `asset.deleted`
- `liability.short_term.added`, `liability.long_term.added`, `liability.updated`, `liability.deleted`
- `networth.calculated`
- `document.added`, `document.deleted`

---

## Features

### Assets
- **Cash & Savings** — institution, account type, interest rate
- **Investments** — platform, ticker symbol, quantity, live prices via Yahoo Finance (yahoo-finance2)
- **Property** — address, property type, mortgage sync, live valuations via HM Land Registry
- **Pensions** — provider, pension type (Workplace/Personal/SIPP/State), contribution type (DC/DB), employee/employer %
- **Vehicles** — registration plate, depreciation valuation (15%/yr compound), DVLA lookup (pending API key)
- **Other** — custom category

### Liabilities
- Short-term (credit cards, loans, insurance premiums)
- Long-term (mortgages, vehicle finance)
- Auto-sync: adding a property with a mortgage auto-creates a linked liability; same for vehicle finance

### Net Worth
- Real-time calculation and breakdown
- Historical snapshots (30-day sparkline chart)
- Portfolio performance (cost basis vs current value)
- Asset allocation and liability breakdown charts

### Documents
- Upload files (PDF, images, etc.) with category tagging
- 8 categories: identity, property, insurance, investments, banking, tax, legal, other
- Expiry date tracking with "Expiring Soon" alerts
- Linked to specific assets

### Open Banking
- Powered by TrueLayer (sandbox mode)
- Connect bank accounts via OAuth
- Import accounts as cash assets

### Financial Services Directory
- 8 service categories: Will Creation, Mortgages, Loans, Life Insurance, Investments, Pensions, Tax, Income Protection
- Pre-fills user details in provider links
- Insurance premium capture → creates liability

### User & Security
- Email verification on registration (via Resend)
- Forgot/reset password (security question or email code)
- Biometric lock (after 5 min background)
- Trusted contacts / digital legacy (nominee delegation)
- Account deletion (GDPR — deletes all data across all services)
- PII field encryption (AES-256-GCM for phone, DOB, address)
- JWT tokens (30-day login, 8-hour delegate)
- Token versioning — password changes invalidate all sessions

### Mobile App
- React Native + Expo SDK 54
- Dark mode support
- Onboarding wizard (first launch)
- Search, sort, and filter on Assets and Liabilities screens
- Document expiry picker and filter chips

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL (localhost:5432, user=postgres, password=postgres123)
- RabbitMQ (localhost:5672)

### Start Services

```bash
cd services/user-service && npm start       # Port 3001
cd services/asset-service && npm start      # Port 3002
cd services/liability-service && npm start  # Port 3003
cd services/networth-service && npm start   # Port 3004
cd services/document-service && npm start   # Port 3005
cd services/openbanking-service && npm start # Port 3007
cd services/service-service && npm start    # Port 3006
```

### Health Checks

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
curl http://localhost:3006/health
curl http://localhost:3007/health
```

### Mobile App

```bash
cd mobile
npx expo start --tunnel
```

Set `IS_PRODUCTION = false` in `mobile/src/api/config.js` for local development.

---

## Environment Variables

Each service requires a `.env` file. Common variables:

```
JWT_SECRET=<64-char hex>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=<servicename>db
DB_USER=postgres
DB_PASSWORD=postgres123
RABBITMQ_URL=amqp://localhost:5672
PORT=300X
```

Additional per-service variables:

**user-service:**
```
RESEND_API_KEY=<key>
FROM_EMAIL=noreply@clearwelth.com
APP_URL=http://192.168.0.6:3001
FIELD_ENCRYPTION_KEY=<64-char hex>
```

**asset-service:**
```
DVLA_API_KEY=<key>  # optional — depreciation works without it
```

**openbanking-service:**
```
TRUELAYER_CLIENT_ID=<id>
TRUELAYER_CLIENT_SECRET=<secret>
TRUELAYER_REDIRECT_URI=https://openbanking.api.clearwelth.com/api/openbanking/callback
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except auth routes.
Currency is GBP (£) throughout.

### Auth (user-service :3001)

```bash
POST /api/users/register          # { first_name, last_name, email, password }
POST /api/users/login             # { email, password } → { token, userId, email }
GET  /api/users/verify-email?token=
POST /api/users/resend-verification
POST /api/users/forgot-password
POST /api/users/reset-password
GET  /api/users/profile
POST /api/users/profile           # update profile
POST /api/users/change-password
POST /api/users/change-email
DELETE /api/users/me              # delete account (requires password)
POST /api/users/security-question
GET  /api/users/security-question/:email
POST /api/users/verify-security-question
POST /api/users/nominees
GET  /api/users/nominees
PUT  /api/users/nominees/:id
DELETE /api/users/nominees/:id
GET  /api/users/delegated-accounts
POST /api/users/delegate/:ownerId
```

### Assets (asset-service :3002)

```bash
GET  /api/assets
POST /api/assets/cash
POST /api/assets/investment
POST /api/assets/property
POST /api/assets/pension
POST /api/assets/other            # also used for vehicles (original_type in metadata)
PUT  /api/assets/:id
DELETE /api/assets/:id
GET  /api/assets/total/value
GET  /api/assets/valuation/property?postcode=
GET  /api/assets/price/quote?ticker=
GET  /api/assets/valuation/vehicle?reg=&purchase_price=&purchase_date=
GET  /api/assets/pension/fund-info?name=
```

### Liabilities (liability-service :3003)

```bash
GET  /api/liabilities
POST /api/liabilities/short-term
POST /api/liabilities/long-term
PUT  /api/liabilities/:id
DELETE /api/liabilities/:id
GET  /api/liabilities/total/amount
```

### Net Worth (networth-service :3004)

```bash
GET /api/networth/calculate
GET /api/networth/breakdown
GET /api/networth/history?days=30
GET /api/networth/export/pdf
```

### Documents (document-service :3005)

```bash
GET    /api/documents
POST   /api/documents/upload      # multipart/form-data
DELETE /api/documents/:id
```

### Open Banking (openbanking-service :3007)

```bash
GET    /api/openbanking/auth-url
GET    /api/openbanking/status
GET    /api/openbanking/accounts
DELETE /api/openbanking/disconnect
GET    /api/openbanking/callback  # TrueLayer OAuth callback
```

### Services (service-service :3006)

```bash
GET /api/services
GET /api/services/health
```

---

## Testing

```bash
cd services/user-service && npm test
cd services/asset-service && npm test
cd services/liability-service && npm test
cd services/networth-service && npm test
cd services/document-service && npm test
cd services/service-service && npm test
```

67 tests across all 6 services (Jest + Supertest). CI runs all in parallel via GitHub Actions.

---

## Production (Railway)

All 7 services are deployed on Railway with auto-deploy on push to `master`.

- **Database**: Railway PostgreSQL per service
- **Message queue**: CloudAMQP (Little Lemur)
- **Email**: Resend (domain: clearwelth.com)
- **Mobile**: `IS_PRODUCTION = true` in `mobile/src/api/config.js`

### API Documentation

Swagger/OpenAPI docs available at `/<service>/api-docs` on each service (local only).

---

## License

MIT
