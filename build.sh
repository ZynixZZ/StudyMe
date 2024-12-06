#!/usr/bin/env bash
# Exit on error
set -o errexit

npm install
npm run build # If you have a build step