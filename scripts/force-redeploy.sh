#!/bin/bash

# Force Railway Redeploy Script
# This creates an empty commit to trigger Railway to redeploy the latest code

set -e

echo "🚀 Force Railway Redeploy Script"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must be run from project root (tms-client)"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "staging" ]; then
    echo "⚠️  Warning: Not on staging branch"
    read -p "Continue anyway? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
        echo "Aborted"
        exit 0
    fi
fi

# Show last commit
echo ""
echo "📝 Last commit:"
git log -1 --oneline
echo ""

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: You have uncommitted changes"
    git status --short
    echo ""
    read -p "Stash changes and continue? (y/N): " confirm
    if [ "$confirm" = "y" ]; then
        git stash
        echo "✅ Changes stashed"
    else
        echo "Aborted"
        exit 0
    fi
fi

# Create empty commit
echo "Creating empty commit to force redeploy..."
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S %Z")
git commit --allow-empty -m "chore: Force Railway redeploy - $TIMESTAMP

Railway failed to deploy the useMemo fix (commit 938edfa).
This empty commit forces a fresh deployment.

Previous commit: $(git log -1 --oneline HEAD | cut -d' ' -f1)
Fix needed: React Error #185 (infinite re-renders)
"

echo "✅ Empty commit created"
echo ""

# Show what will be pushed
echo "📤 Will push to origin/$CURRENT_BRANCH"
git log -2 --oneline
echo ""

read -p "Push to remote? (y/N): " confirm
if [ "$confirm" = "y" ]; then
    git push origin $CURRENT_BRANCH
    echo ""
    echo "✅ Pushed to remote"
    echo ""
    echo "🎯 Next steps:"
    echo "  1. Watch Railway dashboard for new deployment"
    echo "  2. Wait for build to complete (~3-5 minutes)"
    echo "  3. Test the app at tms-client-staging.up.railway.app"
    echo "  4. Open a chat and check for React Error #185"
    echo ""
    echo "Expected: Chat should open without errors! 🎉"
else
    echo ""
    echo "⚠️  Push cancelled"
    echo "To push manually: git push origin $CURRENT_BRANCH"
fi

echo ""
echo "Done! 🚀"
