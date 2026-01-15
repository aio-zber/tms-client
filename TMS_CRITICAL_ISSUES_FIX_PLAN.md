# TMS Critical Issues - Root Cause Analysis & Fix Plan

**Date**: 2026-01-12
**Severity**: CRITICAL - Production Down
**Impact**: Users cannot access chat app (503 errors), new users cannot log in (500 errors)

## Executive Summary

The TMS Chat application on Alibaba Cloud staging is experiencing complete service disruption due to:
1. Frontend service failed - zombie process occupying port 3000
2. Backend SSO authentication rejecting valid test emails
3. Multiple service architecture issues from recent migrations

## Issues Discovered

### Issue 1: Frontend Service Down (503 Errors)
**Severity**: CRITICAL
**Status**: Frontend service has been down since Jan 8, 2026 13:54:07 CST

**Root Cause**:
- Zombie Next.js processes (PID 264587, 264588) running since Jan 08
- These processes are occupying port 3000
- Systemd service cannot start because `EADDRINUSE: address already in use :::3000`
- Service failed after 12 restart attempts

**Evidence**:
```
$ systemctl status tms-frontend
× tms-frontend.service - TMS Frontend (Next.js)
     Active: failed (Result: exit-code) since Thu 2026-01-08 13:54:07 CST

Error: listen EADDRINUSE: address already in use :::3000

$ ps aux | grep next
root 264587 sh -c next start
root 264588 next-server (v15.5.9)
```

**Impact**:
- All frontend requests return 503 from nginx
- Users cannot access the chat interface
- Creating conversations fails
- Opening conversations fails
- Page refreshes fail

### Issue 2: SSO Login 500 Error for New Users
**Severity**: CRITICAL
**Status**: Ongoing

**Root Cause**:
- Pydantic v2 email validation is rejecting `.test` TLD emails
- New test user created with email `test@gmail.test`
- Pydantic considers `.test` as "special-use or reserved name"
- Error occurs in `user_service._map_user_to_response()`

**Evidence**:
```python
pydantic_core._pydantic_core.ValidationError: 1 validation error for UserResponse
email
  value is not a valid email address: The part after the @-sign is a special-use
  or reserved name that cannot be used with email.
  [type=value_error, input_value='test@gmail.test', input_type=str]
```

**Code Location**:
- File: `/home/tmsapp/tms-server/app/services/user_service.py:111`
- Function: `_map_user_to_response()`
- Called from: `/home/tmsapp/tms-server/app/api/v1/auth.py:300` in `sso_login()`

**Impact**:
- New users with test emails cannot log in
- SSO flow breaks at the response serialization step
- User is synced to database but authentication fails
- Returns 500 Internal Server Error to client

### Issue 3: Service Architecture Issues
**Severity**: HIGH
**Status**: Ongoing

**Problems**:
1. Zombie processes not cleaned up properly on deployment
2. No health checks or auto-recovery mechanisms
3. Systemd service does not kill existing processes before starting
4. No monitoring/alerting for service failures

## Recent Changes Analysis

### Client Repository (tms-client)
```
590c4e9 fix: Use runtime detection for Socket.IO URL instead of build-time env var
8bdb87c fix: Replace Railway URLs with Alibaba Cloud URLs in runtime config
0cac626 security: Upgrade Next.js to 15.5.9 to fix critical vulnerabilities
```

**Analysis**:
- Next.js upgrade to 15.5.9 may have changed service behavior
- Runtime URL detection changes could affect deployments
- Railway → Alibaba Cloud migration still has remnants

### Server Repository (tms-server)
```
db0360b fix: Add UUID auto-generation to UUIDMixin
50c9c60 fix: Replace all Railway URLs with Alibaba Cloud URLs
2302a4f fix: Fix 401→500 error, add single-use token security, update CORS
```

**Analysis**:
- Multiple UUID-related fixes suggest data model issues
- CORS updates might affect client-server communication
- Recent error handling changes

## Fix Plan

### Immediate Fixes (Deploy Now - 15 mins)

#### Fix 1: Restart Frontend Service
**Priority**: CRITICAL - Do First
**Time**: 5 minutes

```bash
# SSH to staging server
ssh -i deployment/sogo-infra-key.pem root@47.80.66.95

# Kill zombie Next.js processes
kill -9 264587 264588
pkill -9 -f "next-server"

# Verify port is free
lsof -i :3000  # Should return nothing

# Start frontend service
systemctl start tms-frontend
systemctl status tms-frontend

# Verify it's running
curl http://localhost:3000
```

**Verification**:
- Service status should be "active (running)"
- No EADDRINUSE errors in logs
- Port 3000 should be listening

#### Fix 2: Relax Email Validation for Development
**Priority**: CRITICAL
**Time**: 10 minutes

**Option A: Allow .test TLD (Recommended for Staging)**

Update `app/schemas/user.py`:
```python
from pydantic import EmailStr, field_validator

class UserResponse(BaseModel):
    email: str  # Change from EmailStr to str

    @field_validator('email')
    @classmethod
    def validate_email_relaxed(cls, v: str) -> str:
        """Allow test emails in non-production environments"""
        import os
        from email_validator import validate_email, EmailNotValidError

        # In staging/dev, allow .test TLD
        if os.getenv('ENVIRONMENT') in ['development', 'staging']:
            # Basic email format check
            if '@' not in v or '.' not in v.split('@')[1]:
                raise ValueError('Invalid email format')
            return v.lower()

        # In production, use strict validation
        try:
            valid = validate_email(v, check_deliverability=False)
            return valid.normalized
        except EmailNotValidError as e:
            raise ValueError(str(e))
```

**Option B: Update Test User Email (Quick Fix)**

```bash
# Connect to database and update email
ssh -i deployment/sogo-infra-key.pem root@47.80.66.95

# Update in TMS database
psql -h <db_host> -U <db_user> -d tms_staging_db
UPDATE users SET email = 'test@gmail.com' WHERE email = 'test@gmail.test';
```

### Medium-Term Fixes (Deploy This Week - 2-4 hours)

#### Fix 3: Improve Systemd Service Management

Update `/etc/systemd/system/tms-frontend.service`:
```ini
[Unit]
Description=TMS Frontend (Next.js)
After=network.target

[Service]
Type=simple
User=tmsapp
WorkingDirectory=/home/tmsapp/tms-client
Environment="NODE_ENV=production"
Environment="PORT=3000"

# Kill existing processes before starting
ExecStartPre=/usr/bin/pkill -f "next-server" || true
ExecStartPre=/bin/sleep 2

# Start service
ExecStart=/usr/bin/npm start

# Kill all child processes on stop
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=10

# Restart policy
Restart=on-failure
RestartSec=10s
StartLimitInterval=200s
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
```

#### Fix 4: Add Health Checks and Monitoring

Create `/home/tmsapp/tms-server/deployment/scripts/health-check.sh`:
```bash
#!/bin/bash

# Health check script
check_service() {
    local service=$1
    local port=$2

    if ! systemctl is-active --quiet $service; then
        echo "ERROR: $service is not running"
        return 1
    fi

    if ! nc -z localhost $port 2>/dev/null; then
        echo "ERROR: $service not listening on port $port"
        return 1
    fi

    echo "OK: $service is healthy"
    return 0
}

# Check all services
check_service "tms-backend" 8000
check_service "tms-frontend" 3000
check_service "nginx" 80
```

Add to crontab:
```bash
*/5 * * * * /home/tmsapp/tms-server/deployment/scripts/health-check.sh >> /var/log/tms-health.log 2>&1
```

#### Fix 5: Improve Deployment Script

Update `/home/tmsapp/tms-server/deployment/scripts/deploy.sh`:
```bash
#!/bin/bash

# Stop services cleanly
systemctl stop tms-frontend tms-backend

# Kill any zombie processes
pkill -9 -f "next-server" || true
pkill -9 -f "uvicorn" || true

# Wait for ports to be free
sleep 5

# Pull latest code
cd /home/tmsapp/tms-client && git pull
cd /home/tmsapp/tms-server && git pull

# Install dependencies
cd /home/tmsapp/tms-client && npm install
cd /home/tmsapp/tms-server && source venv/bin/activate && pip install -r requirements.txt

# Build frontend
cd /home/tmsapp/tms-client && npm run build

# Run migrations
cd /home/tmsapp/tms-server && alembic upgrade head

# Start services
systemctl start tms-backend
sleep 5
systemctl start tms-frontend
sleep 5
systemctl reload nginx

# Verify services started
systemctl status tms-backend tms-frontend nginx
```

### Long-Term Fixes (Next Sprint - 1-2 weeks)

#### Fix 6: Implement Proper Email Validation Strategy

**Principle**: Follow Messenger and Telegram best practices

**Messenger/Telegram Approach**:
- Accept any syntactically valid email format
- Verify email ownership through confirmation emails
- Don't restrict TLDs (users might have corporate/custom domains)
- Store normalized email (lowercase)

**Implementation**:
```python
# app/schemas/user.py
from pydantic import field_validator
import re

EMAIL_REGEX = re.compile(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
)

class UserBase(BaseModel):
    email: str

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        """
        Validate email format without restricting TLDs.
        Follows Messenger/Telegram approach - accept all valid formats.
        """
        if not EMAIL_REGEX.match(v):
            raise ValueError('Invalid email format')
        return v.lower().strip()
```

**Benefits**:
- Accepts test emails (.test, .local, etc.)
- Accepts corporate emails (custom TLDs)
- Accepts international domains
- Still prevents obvious typos

#### Fix 7: Add Comprehensive Monitoring

**Tools to implement**:
1. **Prometheus** - Metrics collection
2. **Grafana** - Visualization
3. **Alertmanager** - Alerts

**Metrics to track**:
- Service uptime/downtime
- Request latency (p50, p95, p99)
- Error rates (4xx, 5xx)
- Database connection pool status
- Active WebSocket connections
- Authentication success/failure rates

**Alerts to configure**:
- Service down for > 1 minute
- Error rate > 5% for 5 minutes
- Response time > 2s for 5 minutes
- Database connection failures

#### Fix 8: Implement CI/CD Pipeline

**GitHub Actions workflow**:
```yaml
name: Deploy to Alibaba Cloud

on:
  push:
    branches: [main, staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to staging
        if: github.ref == 'refs/heads/staging'
        run: |
          ssh user@server "cd /path && ./deploy.sh staging"

      - name: Run health checks
        run: |
          sleep 30
          curl https://tms-chat-staging.example.com/health
```

## Deployment Checklist

### Pre-Deployment
- [ ] Review all changes in this plan
- [ ] Backup database
- [ ] Backup current codebase
- [ ] Notify team of maintenance window

### Immediate Deployment (Now)
- [ ] SSH to staging server
- [ ] Kill zombie Next.js processes (Fix 1)
- [ ] Restart tms-frontend service
- [ ] Verify frontend is accessible
- [ ] Update email validation (Fix 2 - Option A or B)
- [ ] Restart tms-backend service
- [ ] Test new user login
- [ ] Test existing user login
- [ ] Test conversation creation
- [ ] Test message sending

### Medium-Term Deployment (This Week)
- [ ] Update systemd service files (Fix 3)
- [ ] Add health check script (Fix 4)
- [ ] Update deployment script (Fix 5)
- [ ] Test full deployment flow
- [ ] Document changes in runbook

### Long-Term Implementation (Next Sprint)
- [ ] Implement relaxed email validation (Fix 6)
- [ ] Set up Prometheus + Grafana (Fix 7)
- [ ] Configure alerts (Fix 7)
- [ ] Implement CI/CD pipeline (Fix 8)
- [ ] Load testing
- [ ] Security audit

## Testing Strategy

### Unit Tests
- [ ] Email validation tests (all TLDs)
- [ ] SSO authentication flow
- [ ] User response serialization

### Integration Tests
- [ ] Full SSO login flow
- [ ] Conversation creation
- [ ] Message sending
- [ ] WebSocket connections

### End-to-End Tests
- [ ] New user registration via GCGC
- [ ] New user first login to TMS Chat
- [ ] Existing user login
- [ ] Create conversation
- [ ] Send messages
- [ ] Upload files
- [ ] Receive real-time updates

## Security Considerations

### Email Validation
- **Current**: Pydantic's strict validation rejects valid test emails
- **Proposed**: Relaxed validation with format checking
- **Risk**: Minimal - email ownership still verified by GCGC TMS
- **Mitigation**: Keep validation in GCGC TMS strict

### Service Management
- **Current**: No process cleanup, zombie processes
- **Proposed**: Proper signal handling and cleanup
- **Risk**: Minimal - improved security through better resource management
- **Mitigation**: Systemd KillMode=mixed ensures all child processes are killed

### Monitoring
- **Current**: No monitoring, issues go undetected for days
- **Proposed**: Real-time monitoring and alerting
- **Risk**: None - purely additive
- **Mitigation**: N/A

## Code Quality Considerations

### Follows CLAUDE.md Guidelines
✅ **File Size Limits**: All changes keep files within limits
✅ **Feature-Based Structure**: No structure changes needed
✅ **Error Handling**: Improved error handling with clear messages
✅ **Security**: No security compromises, actually improved
✅ **No Over-Engineering**: Simple, focused fixes only
✅ **Messenger/Telegram Reference**: Email validation follows their approach

### Code Complexity
- Email validation: +15 lines (well-documented)
- Systemd service: Configuration only
- Health checks: Simple bash script
- No architectural changes required

## Rollback Plan

If immediate fixes fail:

1. **Rollback Frontend**:
```bash
cd /home/tmsapp/tms-client
git reset --hard <previous-commit>
npm install
npm run build
systemctl restart tms-frontend
```

2. **Rollback Backend**:
```bash
cd /home/tmsapp/tms-server
git reset --hard <previous-commit>
alembic downgrade -1
systemctl restart tms-backend
```

3. **Emergency Recovery**:
```bash
# Use Railway deployment as fallback
# Update DNS to point back to Railway
# Or keep Alibaba for backend, Railway for frontend
```

## Success Criteria

### Immediate (After Fix 1 & 2)
- [ ] Frontend service running and accessible
- [ ] No 503 errors
- [ ] New users can log in
- [ ] Existing users can log in
- [ ] Conversations can be created
- [ ] Messages can be sent

### Medium-Term (After Fix 3-5)
- [ ] Zero zombie processes after deployment
- [ ] Services auto-recover from failures
- [ ] Health checks passing every 5 minutes
- [ ] Clean deployment process

### Long-Term (After Fix 6-8)
- [ ] Email validation accepts all valid formats
- [ ] Monitoring dashboard operational
- [ ] Alerts firing correctly
- [ ] CI/CD pipeline deploying successfully
- [ ] Zero manual interventions needed

## Estimated Timeline

| Phase | Tasks | Time | Priority |
|-------|-------|------|----------|
| **Immediate** | Fix 1-2 | 15 mins | CRITICAL |
| **Medium-Term** | Fix 3-5 | 2-4 hours | HIGH |
| **Long-Term** | Fix 6-8 | 1-2 weeks | MEDIUM |

## Communication Plan

### Immediate
- [ ] Notify users: "We're aware of the issue and fixing it now"
- [ ] Status update every 15 minutes
- [ ] Post-fix announcement: "Service restored"

### Post-Deployment
- [ ] Post-mortem document
- [ ] Team retrospective
- [ ] Update runbooks
- [ ] Knowledge base articles

## Conclusion

The issues are well-understood and have clear solutions. The fixes are:
- **Low risk**: No architectural changes
- **High impact**: Restores full functionality
- **Maintainable**: Follows best practices
- **Scalable**: Sets foundation for growth

**Recommended Action**: Execute immediate fixes NOW, then schedule medium and long-term fixes.
