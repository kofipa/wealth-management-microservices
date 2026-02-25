# Wealth Management Microservices

A complete microservices application for managing personal wealth, built from Event Storming output using Node.js, PostgreSQL, RabbitMQ, and Nginx.

## Architecture Overview

This application consists of 6 microservices:

1. **User Service** (Port 3001) - User authentication and profile management
2. **Asset Service** (Port 3002) - Manage cash, investments, properties, and other assets
3. **Liability Service** (Port 3003) - Track short-term and long-term liabilities
4. **Net Worth Service** (Port 3004) - Calculate net worth by aggregating assets and liabilities
5. **Document Service** (Port 3005) - Upload and manage supporting documents
6. **API Gateway** (Port 8080) - Nginx reverse proxy routing requests to services

### Event-Driven Communication

Services communicate through RabbitMQ using a topic exchange. Key events include:
- `user.registered`, `user.logged_in`, `user.profile.added`, `user.profile.updated`
- `asset.cash.added`, `asset.investment.added`, `asset.property.added`, `asset.other.added`, `asset.updated`, `asset.deleted`
- `liability.short_term.added`, `liability.long_term.added`, `liability.updated`, `liability.deleted`
- `networth.calculated`
- `document.added`, `document.deleted`

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Git

## Project Structure

```
wealth-management-microservices/
├── api-gateway/
│   └── nginx.conf
├── services/
│   ├── user-service/
│   │   ├── src/
│   │   │   └── app.js
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── asset-service/
│   │   ├── src/
│   │   │   └── app.js
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── liability-service/
│   │   ├── src/
│   │   │   └── app.js
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── networth-service/
│   │   ├── src/
│   │   │   └── app.js
│   │   ├── package.json
│   │   └── Dockerfile
│   └── document-service/
│       ├── src/
│       │   └── app.js
│       ├── package.json
│       └── Dockerfile
└── docker-compose.yml
```

## Setup Instructions

### 1. Clone and Setup

```bash
# Create project directory
mkdir wealth-management-microservices
cd wealth-management-microservices

# Create directory structure
mkdir -p api-gateway
mkdir -p services/{user-service,asset-service,liability-service,networth-service,document-service}/src
```

### 2. Copy Configuration Files

Copy all the provided files into their respective directories:
- `docker-compose.yml` → root directory
- `nginx.conf` → `api-gateway/`
- Service files → respective `services/*/src/app.js`
- `package.json` files → respective `services/*/`
- `Dockerfile` files → respective `services/*/`

### 3. Create Package.json for All Services

Each service needs a `package.json`. Here's a template (adjust dependencies per service):

**User Service, Asset Service, Liability Service:**
```json
{
  "name": "service-name",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "amqplib": "^0.10.3",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2"
  }
}
```

**Net Worth Service:**
```json
{
  "name": "networth-service",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "amqplib": "^0.10.3",
    "jsonwebtoken": "^9.0.2",
    "axios": "^1.6.0"
  }
}
```

**Document Service:**
```json
{
  "name": "document-service",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "amqplib": "^0.10.3",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1"
  }
}
```

### 4. Create Dockerfiles

Each service needs a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 300X  # Change X to service port
CMD ["npm", "start"]
```

### 5. Start the Application

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

### 6. Verify Services are Running

```bash
# Check all containers
docker-compose ps

# Check API Gateway health
curl http://localhost:8080/health

# Check individual service health
curl http://localhost:3001/health  # User Service
curl http://localhost:3002/health  # Asset Service
curl http://localhost:3003/health  # Liability Service
curl http://localhost:3004/health  # Net Worth Service
curl http://localhost:3005/health  # Document Service
```

### 7. Access RabbitMQ Management UI

Visit: http://localhost:15672
- Username: `admin`
- Password: `admin`

## API Usage Examples

### 1. Register a User

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:8080/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Response will include a JWT token. Use this token for all subsequent requests.

### 3. Add User Profile

```bash
curl -X POST http://localhost:8080/api/users/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "date_of_birth": "1990-01-01",
    "address": "123 Main St, City, Country"
  }'
```

### 4. Add Cash Asset

```bash
curl -X POST http://localhost:8080/api/assets/cash \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Savings Account",
    "value": 50000,
    "currency": "USD",
    "description": "Primary savings account"
  }'
```

### 5. Add Investment Asset

```bash
curl -X POST http://localhost:8080/api/assets/investment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Stock Portfolio",
    "value": 150000,
    "currency": "USD",
    "description": "Tech stocks and ETFs"
  }'
```

### 6. Add Property Asset

```bash
curl -X POST http://localhost:8080/api/assets/property \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Primary Residence",
    "value": 500000,
    "currency": "USD",
    "description": "3BR house in suburbs"
  }'
```

### 7. Add Short-term Liability

```bash
curl -X POST http://localhost:8080/api/liabilities/short-term \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Credit Card Debt",
    "amount": 5000,
    "currency": "USD",
    "interest_rate": 18.99,
    "due_date": "2025-12-31",
    "description": "Various credit cards"
  }'
```

### 8. Add Long-term Liability

```bash
curl -X POST http://localhost:8080/api/liabilities/long-term \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Mortgage",
    "amount": 350000,
    "currency": "USD",
    "interest_rate": 3.5,
    "due_date": "2045-01-01",
    "description": "30-year fixed mortgage"
  }'
```

### 9. Calculate Net Worth

```bash
curl http://localhost:8080/api/networth/calculate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 10. Get Detailed Net Worth Breakdown

```bash
curl http://localhost:8080/api/networth/breakdown \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 11. Get All Assets

```bash
curl http://localhost:8080/api/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by type
curl "http://localhost:8080/api/assets?type=investment" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 12. Upload Document

```bash
curl -X POST http://localhost:8080/api/documents/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "related_entity_type=asset" \
  -F "related_entity_id=1" \
  -F "description=Property deed"
```

### 13. List Documents

```bash
curl http://localhost:8080/api/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Monitoring and Debugging

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f user-service
docker-compose logs -f asset-service
```

### Access Databases

```bash
# User database
docker-compose exec postgres-user psql -U postgres -d userdb

# Asset database
docker-compose exec postgres-asset psql -U postgres -d assetdb

# Liability database
docker-compose exec postgres-liability psql -U postgres -d liabilitydb

# Document database
docker-compose exec postgres-document psql -U postgres -d documentdb
```

### Monitor RabbitMQ

Access the management UI at http://localhost:15672 to:
- View queues and exchanges
- Monitor message flow
- Check connection status

## Stopping the Application

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

## Production Considerations

Before deploying to production:

1. **Security:**
   - Change JWT_SECRET to a strong random value
   - Use environment variables for all secrets
   - Implement rate limiting
   - Add HTTPS/TLS termination
   - Enable CORS properly for your frontend domain

2. **Scalability:**
   - Deploy services across multiple instances
   - Use a load balancer
   - Implement service mesh (e.g., Istio)
   - Use managed databases (RDS, Cloud SQL)
   - Use managed message queue (CloudAMQP, AWS MQ)

3. **Monitoring:**
   - Add logging aggregation (ELK stack, Datadog)
   - Implement distributed tracing (Jaeger, Zipkin)
   - Set up metrics collection (Prometheus)
   - Configure alerts

4. **Data:**
   - Implement database backups
   - Set up replication for high availability
   - Consider data encryption at rest
   - Implement proper data retention policies

5. **API Gateway:**
   - Add authentication at gateway level
   - Implement circuit breakers
   - Add request/response caching
   - Rate limiting per user/IP

## Next Steps

To extend this application:

1. **Add Service Service** - Display financial services and offers
2. **Implement External API Integration** - Connect to real asset/liability APIs
3. **Add Frontend** - Build a React/Vue.js frontend
4. **Implement CI/CD** - Set up GitHub Actions or Jenkins
5. **Add Testing** - Unit tests, integration tests, E2E tests
6. **Implement API Documentation** - Use Swagger/OpenAPI
7. **Add Caching Layer** - Redis for frequently accessed data
8. **Implement Saga Pattern** - For distributed transactions

## License

MIT
