# Apna Park Premiere League — Deployment Guide

## Quick Start (Docker Compose)

```bash
docker compose up -d
```

App will be available at `http://localhost:5000`

## Build Image Manually

```bash
docker build -t apna-park-premiere-league .
docker run -p 5000:5000 apna-park-premiere-league
```

## Cloud Deployment

### AWS (ECS / App Runner / Lightsail)

```bash
# Tag and push to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
docker tag apna-park-premiere-league:latest <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/appl:latest
docker push <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/appl:latest
```

Then create an ECS service or App Runner service pointing to the image. Set the container port to `5000`.

### Google Cloud Run

```bash
gcloud builds submit --tag gcr.io/<PROJECT_ID>/appl
gcloud run deploy appl --image gcr.io/<PROJECT_ID>/appl --port 5000 --allow-unauthenticated
```

### Azure Container Apps

```bash
az containerapp up --name appl --image apna-park-premiere-league --target-port 5000 --ingress external
```

### Railway / Render / Fly.io

These platforms auto-detect the Dockerfile. Just connect your repo and deploy — they will build and run it automatically.

**Railway:** Set port to `5000` in settings (or it reads the `PORT` env var automatically).

**Render:** Create a new Web Service → Docker → it picks up the Dockerfile.

**Fly.io:**
```bash
fly launch   # auto-detects Dockerfile
fly deploy
```

## Environment Variables

| Variable   | Default | Description            |
|------------|---------|------------------------|
| `PORT`     | `5000`  | Server listen port     |
| `NODE_ENV` | —       | Set to `production`    |

## Credentials

| Role    | Username | Password   |
|---------|----------|------------|
| Admin   | admin    | appl2026   |
| Guest   | guest    | guest      |
| Captain | (set by admin during team setup) | |

## Image Details

- **Base:** `node:20-alpine`
- **Multi-stage build:** ~50 MB final image (no source code or devDependencies)
- **Health check:** Built-in, hits `/api/auction` every 30s
- **Stateless:** All data is in-memory. Restarting the container resets the auction.
