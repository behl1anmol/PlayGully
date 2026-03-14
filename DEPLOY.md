# Deployment Guide

## Recommended setup (free): Render + Neon

This app is a full-stack Node service (frontend + API in one container) with PostgreSQL.

### 1) Create a Neon database

1. Create a Neon project and database.
2. Copy the **direct** Postgres connection string (with SSL enabled).
3. Keep it ready as `DATABASE_URL`.

### 2) Initialize schema before first deploy

Run from your machine once (and again whenever schema changes):

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

### 3A) Deploy to Render from GitHub (recommended)

This repo includes `render.yaml`, so you can use **New → Blueprint** in Render.

`render.yaml` config summary:
- Runtime: Docker (`Dockerfile` in repo root)
- Plan: Free
- Health check path: `/`
- Required env var: `DATABASE_URL` (prompted via `sync: false`)

Steps:
1. Push latest code to GitHub.
2. In Render Dashboard, create a **Blueprint** from this repo.
3. Provide `DATABASE_URL` when prompted.
4. Deploy.

### 3B) Deploy to Render from Docker Hub image (optional)

Yes, Render supports image-backed services, including private Docker Hub images.

1. In Render, create a **Web Service**.
2. Under source, choose **Existing Image**.
3. Image URL: `docker.io/behl1anmol/playgully:latest`
4. Add registry credential:
	- Registry: Docker Hub
	- Username: your Docker Hub username
	- Personal Access Token: token with access to private repos
5. Set env var `DATABASE_URL` to your Neon connection string.
6. Deploy.

> Note: image-backed services do not auto-redeploy on new image pushes unless you manually trigger deploy (or use a deploy hook).

## Environment variables

Required:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname?sslmode=require
```

Optional:

```env
NODE_ENV=production
PORT=3000
```

## Local development

```bash
npm install
npm run dev
```

## Local production test

```bash
npm run build
npm start
```

## Docker local run

```bash
docker build -t playgully .
docker run -p 3000:3000 --env-file .env playgully
```

## Docker Compose local run

```bash
docker compose up -d
```
