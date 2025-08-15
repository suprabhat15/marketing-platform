# Deployment Setup Guide

This document explains how to set up automated deployment with GitHub Actions for both development and production environments.

## GitHub Actions Workflows

### Development Workflow (`deploy-dev.yml`)
- **Triggers**: Push/PR to any `develop*` branch
- **Actions**: Run tests, type checking, linting, and build
- **Deploy**: Only deploys on push to `develop` branch

### Production Workflow (`deploy-prod.yml`)
- **Triggers**: Push/PR to `main` branch
- **Actions**: Run tests, type checking, linting, security audit, and build
- **Deploy**: Only deploys on push to `main` branch with production environment protection

## Required GitHub Secrets

### Development Environment Secrets
```
DEV_DATABASE_URL=postgresql://username:password@host:port/database
DEV_NEXTAUTH_SECRET=your-dev-secret-key
DEV_APP_URL=https://your-dev-domain.com
DEV_GOOGLE_CLIENT_ID=your-dev-google-client-id
DEV_GOOGLE_CLIENT_SECRET=your-dev-google-client-secret
DEV_AWS_ACCESS_KEY_ID=your-dev-aws-access-key
DEV_AWS_SECRET_ACCESS_KEY=your-dev-aws-secret-key
DEV_AWS_REGION=your-aws-region
DEV_AWS_SES_FROM_EMAIL=noreply@your-dev-domain.com
```

### Production Environment Secrets
```
PROD_DATABASE_URL=postgresql://username:password@host:port/database
PROD_NEXTAUTH_SECRET=your-prod-secret-key
PROD_APP_URL=https://your-production-domain.com
PROD_GOOGLE_CLIENT_ID=your-prod-google-client-id
PROD_GOOGLE_CLIENT_SECRET=your-prod-google-client-secret
PROD_AWS_ACCESS_KEY_ID=your-prod-aws-access-key
PROD_AWS_SECRET_ACCESS_KEY=your-prod-aws-secret-key
PROD_AWS_REGION=your-aws-region
PROD_AWS_SES_FROM_EMAIL=noreply@your-production-domain.com
```

### Deployment Provider Secrets (Choose one)

#### For Vercel Deployment
```
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-vercel-org-id
VERCEL_PROJECT_ID=your-vercel-project-id
```

#### For AWS Deployment
Additional AWS deployment secrets would go here.

## Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Click on **Settings** tab
3. Navigate to **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret listed above

## Setting Up GitHub Environments

### Production Environment Protection
1. Go to **Settings** → **Environments**
2. Create environment named `production`
3. Add protection rules:
   - Required reviewers
   - Wait timer (optional)
   - Deployment branches (restrict to `main`)

## Deployment Providers

### Option 1: Vercel (Recommended for Next.js)

Uncomment the Vercel deployment section in the workflow files:

```yaml
- name: Deploy to Vercel
  uses: amondnet/vercel-action@v25
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    scope: ${{ secrets.VERCEL_ORG_ID }}
    vercel-args: '--prod'  # For production only
```

### Option 2: AWS (EC2/ECS/Lambda)

Uncomment the AWS deployment section and customize based on your AWS setup:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.PROD_AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.PROD_AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.PROD_AWS_REGION }}

- name: Deploy to AWS
  run: |
    # Add your specific AWS deployment commands
    # Examples:
    # aws s3 sync ./out s3://your-bucket-name
    # aws ecs update-service --cluster your-cluster --service your-service
```

### Option 3: Custom Hosting

Add your custom deployment commands in the deployment step:

```yaml
- name: Deploy to Custom Host
  run: |
    # Add your deployment commands here
    # Examples:
    # rsync -avz --delete ./out/ user@server:/var/www/html/
    # ssh user@server 'pm2 restart mailpackr'
```

## Database Migrations

### Development
- Uses `prisma db push` for development (schema sync without migrations)

### Production
- Uses `prisma migrate deploy` for production (applies committed migrations)
- **Important**: Always test migrations in development first
- **Important**: Backup your production database before deployment

## Environment Variables

Make sure these environment variables are properly set in your hosting provider:

### Required for Runtime
- `DATABASE_URL`
- `NEXTAUTH_SECRET` (or `BETTER_AUTH_SECRET`)
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_SES_FROM_EMAIL`

## Workflow Features

### Development Workflow
- ✅ Code quality checks (lint, type-check)
- ✅ Build verification
- ✅ Automatic deployment on develop branch
- ✅ PR validation

### Production Workflow
- ✅ All development checks
- ✅ Security audit
- ✅ Production environment protection
- ✅ Database migration deployment
- ✅ Deployment notifications

## Troubleshooting

### Common Issues

1. **Build Failures**: Check environment variables and dependencies
2. **Database Connection**: Verify DATABASE_URL format and accessibility
3. **Migration Failures**: Ensure migrations are committed and tested
4. **Deployment Timeouts**: Check hosting provider limits and logs

### Debug Steps

1. Check GitHub Actions logs
2. Verify all secrets are set correctly
3. Test build locally with same environment variables
4. Check hosting provider deployment logs

## Security Best Practices

1. Use different secrets for dev/prod environments
2. Enable branch protection rules
3. Require PR reviews for main branch
4. Use environment protection for production
5. Regularly rotate secrets and access keys
6. Monitor deployment logs for security issues

## Monitoring

Consider adding monitoring and alerting:
- Application performance monitoring (APM)
- Error tracking (e.g., Sentry)
- Uptime monitoring
- Database monitoring
- AWS CloudWatch (if using AWS)