# Opmaint — Permit to Work (PTW) System

A robust, enterprise-grade Permit to Work (PTW) management platform for industrial manufacturing facilities, built with Next.js (App Router), TypeScript, PostgreSQL, and Prisma.

---

## 1. Authentication & Session Architecture

Authentication in the Opmaint PTW system uses cryptographically signed JSON Web Tokens (JWT) stored in secure HTTP-only cookies, combined with database-authoritative state resolution.

### Security Guarantees
- **Minimal Token Identity**: JWT payloads contain only the essential user identifier (`sub = userId`) and standard claims (`iat`, `exp`). Roles and active states are **never** trusted from the JWT payload.
- **Database As Single Source of Truth**: Every authenticated request resolves the user from PostgreSQL using `prisma.user.findUnique`. Upgraded roles, demotions, and account deactivations take effect immediately.
- **Deactivation Enforcement**: Inactive users (`isActive = false`) cannot log in and are immediately blocked by authentication middleware, even if presenting an unexpired token.
- **Password Hashing**: Passwords are encrypted using standard `bcryptjs` with a work factor of 10 salt rounds. Plaintext passwords and hashes are never exposed.
- **Timing & Enumeration Resistance**: Login failures for both non-existent emails and incorrect passwords return an identical generic error message (`"Invalid email or password"`), preventing account enumeration attacks.
- **Safe Response Sanitization**: User-facing responses strictly expose only safe attributes (`id`, `name`, `email`, `role`). `passwordHash`, secrets, and internal database metadata are never leaked.

### Cookie Configuration
The session cookie is issued upon successful login:
- **Name**: `opmaint_token`
- **HttpOnly**: `true` (inaccessible to client-side JavaScript, protecting against XSS token theft)
- **SameSite**: `Lax` (safeguards against CSRF while permitting top-level navigations)
- **Secure**: `true` in production (`false` in development/test environments)
- **Path**: `/`
- **Max-Age**: `28800` (8 hours, matching token lifetime)

---

## 2. API Endpoints (Phase 1 Implemented)

### 2.1 Login Endpoint
Authenticates user credentials and issues an HTTP-only session cookie.

- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Headers**: `Content-Type: application/json`

#### Request Body
```json
{
  "email": "requester@opmaint.local",
  "password": "password123"
}
```

#### Success Response (`200 OK`)
Sets `Set-Cookie: opmaint_token=<jwt>; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
```json
{
  "user": {
    "id": "cmucnt6at0006ff10v8u81203",
    "name": "Sunil Verma (Maintenance Lead / Requester)",
    "email": "requester@opmaint.local",
    "role": "REQUESTER"
  }
}
```

#### Error Responses
- **`401 Unauthorized`**:
  ```json
  {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password"
  }
  ```
- **`403 Forbidden`**:
  ```json
  {
    "code": "FORBIDDEN",
    "message": "Account is deactivated. Please contact an administrator."
  }
  ```
- **`422 Unprocessable Entity`**:
  ```json
  {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload format or missing required fields.",
    "details": [
      { "path": "email", "message": "Invalid email address" }
    ]
  }
  ```

---

### 2.2 Current User Session Endpoint
Returns the profile and authoritative database role of the currently authenticated user.

- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Cookie**: `opmaint_token=<jwt>` (or fallback `Authorization: Bearer <jwt>`)

#### Success Response (`200 OK`)
```json
{
  "user": {
    "id": "cmucnt6at0006ff10v8u81203",
    "name": "Sunil Verma (Maintenance Lead / Requester)",
    "email": "requester@opmaint.local",
    "role": "REQUESTER"
  }
}
```

#### Error Response (`401 Unauthorized`)
Returned when the cookie is missing, forged, expired, or the user is deactivated.
```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required. Please log in."
}
```

---

### 2.3 Logout Endpoint
Terminates the user session by clearing the authentication cookie.

- **Method**: `POST`
- **Path**: `/api/auth/logout`

#### Success Response (`200 OK`)
Sets `Set-Cookie: opmaint_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 3. Environment Variables

Create a `.env` file in the root directory following `.env.example`:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://USER:PASSWORD@HOST:5432/opmaint_ptw?schema=public` |
| `JWT_SECRET` | 32+ character secret key for JWT HMAC signing | `your-secure-random-secret-at-least-32-chars` |
| `NEXT_PUBLIC_APP_URL` | Frontend application base URL | `http://localhost:3000` |
| `NODE_ENV` | Environment identifier | `development` / `production` / `test` |

> **Security Note**: In production (`NODE_ENV=production`), the application halts startup if `JWT_SECRET` is missing or matches the default placeholder value.

---

## 4. Testing

```bash
# Run unit tests (domain state machine, validation, and authorization)
npm test

# Run real PostgreSQL integration tests (constraints, triggers, audit immutability, and auth APIs)
npm run test:integration

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Build production bundle
npm run build
```
