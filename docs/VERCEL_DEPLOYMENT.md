# Vercel Deployment Guide

## Prerequisites

- Vercel account
- GitHub repository connected to Vercel
- Environment variables configured in Vercel dashboard

## Environment Variables

Configure the following environment variables in your Vercel project settings:

### Required Variables

| Variable Name | Description | Example |
|--------------|-------------|---------|
| `CLIENT_ID` | Client identifier for the application | `cartorioallanguerra` |
| `BACKEND_URL_BASE` | Base URL for the backend API | `https://api.example.com` |
| `FUNIFIER_API_KEY` | Funifier API key | `your-api-key` |
| `FUNIFIER_BASE_URL` | Funifier API base URL | `https://service2.funifier.com` |
| `FUNIFIER_BASIC_TOKEN` | Funifier basic authentication token | `your-basic-token` |

### How to Add Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable with its value
4. Select the appropriate environments (Production, Preview, Development)
5. Click **Save**

## Deployment Configuration

The project includes a `vercel.json` configuration file with the following settings:

```json
{
  "buildCommand": "npm run build -- --configuration=production",
  "outputDirectory": "dist/game4u-front",
  "installCommand": "npm ci",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Note**: Uses `rewrites` instead of `routes` to be compatible with `headers` configuration.

## Build Process

### Automatic Deployment

Vercel automatically deploys when you push to your connected Git repository:

- **Production**: Pushes to `main` branch
- **Preview**: Pull requests and pushes to other branches

### Manual Deployment

You can also deploy manually using the Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Build Commands

The following commands are used during deployment:

```bash
# Install dependencies (uses package-lock.json for consistency)
npm ci

# Build for production
npm run build -- --configuration=production
```

## Troubleshooting

### Build Fails with "environment.prod.ts does not exist"

**Solution**: Ensure all environment files exist in `src/environments/`:
- `environment.ts`
- `environment.prod.ts`
- `environment.homol.ts`

### Environment Variables Not Working

**Solution**: 
1. Verify variables are set in Vercel dashboard
2. Ensure variable names match exactly (case-sensitive)
3. Redeploy after adding/updating variables
4. Check that the custom webpack config is loading environment variables correctly

### Build Timeout

**Solution**:
1. Check if dependencies are cached properly
2. Consider upgrading Vercel plan for longer build times
3. Optimize build by removing unused dependencies

### 404 Errors on Page Refresh

**Solution**: The `vercel.json` includes rewrite configuration to handle SPA routing:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This ensures all routes are handled by the Angular app.

## Performance Optimization

### Caching Strategy

The `vercel.json` includes cache headers for static assets:

```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### Build Output

- **Initial Bundle**: ~324 KB (compressed)
- **Lazy Chunks**: Loaded on demand
- **Total Size**: ~1.46 MB (raw) / ~324 KB (compressed)

## Security Headers

The deployment includes security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Monitoring

### Build Logs

View build logs in Vercel Dashboard:
1. Go to your project
2. Click on **Deployments**
3. Select a deployment
4. View **Build Logs**

### Runtime Logs

View runtime logs:
1. Go to your project
2. Click on **Deployments**
3. Select a deployment
4. View **Function Logs** (if using serverless functions)

## Rollback

To rollback to a previous deployment:

1. Go to **Deployments** in Vercel Dashboard
2. Find the previous working deployment
3. Click the three dots menu
4. Select **Promote to Production**

## Custom Domain

To add a custom domain:

1. Go to **Settings** → **Domains**
2. Add your domain
3. Configure DNS records as instructed
4. Wait for DNS propagation (can take up to 48 hours)

## CI/CD Integration

The project includes GitHub Actions workflow (`.github/workflows/ci-cd.yml`) that runs:

- Linting
- Type checking
- Unit tests
- Security audit
- Build verification

Vercel deployment happens automatically after these checks pass.

## Support

For issues specific to Vercel deployment:
- Check [Vercel Documentation](https://vercel.com/docs)
- Contact Vercel Support
- Review build logs for specific error messages

## Checklist

Before deploying to production:

- [ ] All environment variables configured in Vercel
- [ ] Build succeeds locally with `npm run build`
- [ ] All tests pass with `npm test`
- [ ] Security audit completed
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Monitoring and analytics set up
- [ ] Backup/rollback plan in place
