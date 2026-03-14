# Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL database
- Environment variables configured

## Environment Variables

Create a `.env` file with:

```
DATABASE_URL=postgresql://user:password@host:port/dbname
SESSION_SECRET=your-secure-session-secret
```

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

## Docker Deployment

```bash
# Build the image
docker build -t playgully .

# Run with environment variables
docker run -p 3000:3000 --env-file .env playgully
```

## Docker Compose

```bash
docker-compose up -d
```

## Database Setup

The app uses Drizzle ORM with PostgreSQL. Run migrations:

```bash
npm run db:push
```

## Deployment Platforms

### Railway
1. Connect your GitHub repository
2. Add environment variables in Railway dashboard
3. Railway will auto-detect and deploy

### Render
1. Create a new Web Service
2. Connect GitHub repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables

### Fly.io
```bash
fly launch
fly secrets set DATABASE_URL=your-url SESSION_SECRET=your-secret
fly deploy
```
