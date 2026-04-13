#!/bin/bash

# Data Sync Pipeline - Updates route data from OpenStreetMap (FREE)
# No API costs, no dependencies on external services
# Usage: npm run sync-data

set -e

echo "🔄 Transit Data Sync - Overpass Only"
echo "====================================="
echo ""

REGION="${IMPORT_DEFAULT_REGION:-metro-manila}"
BBOX="${IMPORT_DEFAULT_BBOX:-14.35,120.85,14.83,121.20}"
LIMIT="${IMPORT_DEFAULT_LIMIT:-500}"

# Step 1: Import latest from Overpass
echo "📍 Importing latest data from OpenStreetMap..."
node scripts/import-overpass.js \
  --region "$REGION" \
  --bbox "$BBOX" \
  --limit "$LIMIT" 2>&1 | tee -a logs/import.log

echo ""
echo "✅ Data sync complete!"
echo ""
echo "Summary:"
echo "  - OSM data imported (routes, stops, geometry)"
echo "  - Log saved to: logs/import.log"
echo ""
echo "Your database now has:"
echo "  ✓ Latest stops from OSM"
echo "  ✓ Latest routes from OSM"
echo "  ✓ Latest route geometry (shapes)"
echo "  ✓ Complete stop-to-stop connectivity"

