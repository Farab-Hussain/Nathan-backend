# Nathan Backend – Comprehensive Candy E‑commerce API (Express & Prisma)

Nathan Backend powers a modern candy e‑commerce platform with secure authentication, rich product modeling (including flavors and bundles), carts, orders, inventory checks, and an administrative surface for operations. Built on Express 5 and Prisma/PostgreSQL, the API emphasizes correctness, security, maintainability, and production readiness.

---

## Table of Contents
- Overview & Vision
- Core Domains & Features
- Architecture & Technology Stack
- Project Structure
- Environment & Configuration
- Local Development
- Database & Migrations
- API Reference (High‑level)
- Authentication & Cookies
- File Uploads & Static Assets
- Admin & Operations
- Observability & Logging
- Security Best Practices
- Performance & Scalability
- Deployment Guide
- Reverse Proxy & Networking
- Troubleshooting & FAQ
- Roadmap: Affiliate System
- Roadmap: Mobile Applications
- Contributing
- License

---

## Overview & Vision
The backend is designed to:
- Provide a robust, secure, and extensible foundation for an online candy store
- Model real business requirements: product flavors, 3‑pack recipes, inventory availability
- Support administrative workflows: product CRUD, order lifecycle, inventory management
- Scale operationally with migrations, logging, and sensible defaults

---

## Core Domains & Features
- Users: registration, login, password reset via 6‑digit code, roles (user/admin)
- Products: flavors via `ProductFlavor`, categories, images, activation flags, SKUs
- Carts & Orders: add to cart, create orders from cart or direct payload; stock decrement on order
- 3‑Pack System: `PackRecipe`, `PackRecipeItem`, `FlavorInventory` with availability checks and SKU generation
- Inventory: read by flavor, low‑stock alerts, updates and bulk updates
- Admin: product CRUD and listing (with pagination/filtering), order status updates, inventory management

---

## Architecture & Technology Stack
- Runtime: Node.js, Express 5
- ORM: Prisma with PostgreSQL
- Auth: JWT (httpOnly cookie)
- Email: Nodemailer (Gmail or Ethereal fallback for development)
- Uploads: Multer to `uploads/` with size/type limits; served statically under `/uploads`
- Logging: custom logger utility (stdout by default)

---

## Project Structure
```
src/
  controller/               # business logic per domain
  middlewares/              # auth/admin/upload middlewares
  routes/                   # express routers by domain
  utils/                    # jwt, mailer, logger
  server.ts                 # app initialization
prisma/
  schema.prisma             # database schema
  migrations/               # migration history
uploads/                    # local file storage (images)
```

---

## Environment & Configuration
Create `.env` with:
```env
PORT=4000
DATABASE_URL=postgresql://user:pass@host:5432/db?s=require
CLIENT_URL=https://app.example.com
JWT_SECRET=please_change_me_to_a_long_random_string
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
NODE_ENV=production
```
Notes:
- Neon/managed Postgres typically requires `?ss=require`.
- If email credentials are missing or Gmail auth fails, the system falls back to Ethereal in development and logs a preview URL and the reset code for convenience.

---

## Local Development
```bash
npm ci
npm run dev
```

---

## Database & Migrations
```bash
npx prisma migrate deploy
# optional
npx prisma generate
```
Prisma schema defines:
- `User`, `Product`, `ProductFlavor`, `Order`, `OrderItem`
- `Flavor`, `PackRecipe`, `PackRecipeItem`, `FlavorInventory`
- Indices on category, status, paymentStatus, active flags, and joins for performance

---

## API Reference (High‑level)
- Auth:
  - `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/logout`, `GET /auth/me`
- Products:
  - Public: `GET /products`, `GET /products/:id`, `GET /products/categories`
  - Admin: `GET /products/admin/all`, `POST /products/admin/products`, `PUT /products/admin/:id`, `DELETE /products/admin/:id`
- Cart:
  - `POST /cart/add`, `GET /cart/cart`, `PUT /cart/:id`, `DELETE /cart/:id`, `DELETE /cart`
- Orders:
  - User: `POST /orders`, `GET /orders`, `GET /orders/:id`
  - Admin: `PUT /orders/:id/status`, `GET /orders/admin/all`
- 3‑Pack & Inventory:
  - `GET /3pack/product`, `GET /3pack/inventory/availability`
  - 3‑Pack cart: `POST /3pack/cart/add`, `GET /3pack/cart`, `PUT /3pack/cart/:id`, `DELETE /3pack/cart/:id`, `DELETE /3pack/cart`
  - Inventory: `GET /inventory`, `GET /inventory/:flavorId`, `PUT /inventory/:flavorId`, `PUT /inventory/bulk`, `GET /inventory/alerts`

---

## Authentication & Cookies
- JWT placed in httpOnly cookie `token`. In production: `secure: true`, `sameSite: lax`.
- For cross‑site setups, prefer proxying API under the same origin; if not possible, consider `SameSite=None; Secure` with strict TLS.

---

## File Uploads & Static Assets
- Multer saves to `/uploads` under sub folders (products, cart, stickers) with file size/type limits.
- Express statically serves `/uploads` for direct image access.
- In production, consider S3/R2 and a CDN for durability and performance.

---

## Admin & Operations
- Admin role enforced by middleware on write endpoints.
- Products list for admins includes inactive products and flavor relations for UI rendering.
- Orders endpoint exposes user info for back‑office needs; restrict responses as necessary.

---

## Observability & Logging
- Simple request log and console logging; integrate PM2 logs or ship to a log stack.
- Recommended: add request IDs and error tracking (Sentry) in production.

---

## Security Best Practices
- Secrets: strong `JWT_SECRET`, rotate periodically
- CORS: set `CLIENT_URL` to the exact origin; only allow credentials from that origin
- Uploads: enforce MIME and size limits; disable directory listing at reverse proxy
- Validation: add Zod/Yup schemas for create/update endpoints (recommended)
- Rate limiting: apply to `/auth/*` and order creation
- HTTPS: required for secure cookies and user trust

---

## Performance & Scalability
- Pagination on listing endpoints (products/orders) to control payload size
- Indices on critical fields to keep queries efficient
- Consider Redis cache for hot product lists and availability checks at scale
- Background jobs for email and stock/inventory reconciliation

---

## Deployment Guide
```bash
npm ci && npm run build
npx prisma migrate deploy
pm2 start dist/src/server.js --name nathan-api
```
Reverse proxy (Nginx/Caddy):
- TLS, HTTP/2, gzip/brotli
- Proxy `/api` (or the full backend) to this service
- Map `/uploads` to backend static

---

## Reverse Proxy & Networking
- Prefer same‑origin cookies by proxying under `/api` from the frontend domain
- If using separate domains, ensure proper cookie domain and `SameSite` handling

---

## Troubleshooting & FAQ
- P1001 (cannot reach DB): verify `DATABASE_URL`, credentials, and SSL mode
- Email 535 (Gmail auth): use an app password; Ethereal fallback active in dev
- CORS/credentials: `CLIENT_URL` must match exactly; enforce HTTPS in prod
- Reset 500s: frontend can send `password` or `newPassword`; backend accepts both

---

## Roadmap: Affiliate System
- Entities: Affiliate, Referral, Commission, Payout
- Features: referral links (UTM), commission ledger, payout cycles, dashboards
- API: endpoints for affiliate registration, link generation, reporting exports

---

## Roadmap: Mobile Applications
- React Native app using the same auth and API (token refresh support)
- Deep links to product, cart, and order detail; push notification endpoints

---

## Contributing
- Use feature branches and concise, descriptive commits
- Prefer small PRs with focused scope; include tests where applicable

## License
- Proprietary / All rights reserved (update if open‑sourcing)