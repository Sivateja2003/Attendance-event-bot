#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Face Attendance System — Update Script
# Run this on the EC2 instance whenever you push new code
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="/opt/face_auth"
WORK_DIR="$APP_DIR/Attendance-using-face-recogination"

echo "Pulling latest code..."
cd "$APP_DIR"
git pull

echo "Rebuilding frontend..."
cd "$WORK_DIR/frontend"
npm install --silent
npm run build

echo "Updating backend dependencies..."
cd "$WORK_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt -q
deactivate

echo "Restarting backend service..."
sudo systemctl restart face-auth
sudo systemctl status face-auth --no-pager

echo "Done! App updated."
