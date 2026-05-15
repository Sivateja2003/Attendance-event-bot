#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Face Attendance System — Update Script
# Run this on the EC2 instance whenever you push new code
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="/opt/face_auth"
WORK_DIR="$APP_DIR"

echo "Pulling latest code..."
cd "$WORK_DIR"
git fetch origin
git reset --hard origin/main

# Warn if new env vars aren't present
ENV_FILE="$WORK_DIR/backend/.env"
for KEY in PINECONE_API_KEY GROQ_API_KEY; do
    if ! grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
        echo "  WARNING: ${KEY} not found in ${ENV_FILE} — search/Groq features will be disabled."
        echo "           Add it and re-run: sudo systemctl restart face-auth"
    fi
done

echo "Rebuilding frontend..."
cd "$WORK_DIR/frontend"
npm install --silent
npm run build

echo "Updating backend dependencies..."
cd "$WORK_DIR/backend"
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

echo "Restarting backend service..."
sudo systemctl restart face-auth
sudo systemctl status face-auth --no-pager

echo "Done! App updated."
