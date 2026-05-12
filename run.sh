#!/bin/bash
# ---------------------------------------------------------------------------
# run.sh — Interactive runner for the Generic Merchant Suite.
# Prompts for site URL, product name, mobile number and discount code,
# then runs the consolidated test in headed mode. The flow stops at COD
# button visibility — no order is placed.
# ---------------------------------------------------------------------------
set -e
cd "$(dirname "$0")"

echo "================================================================"
echo "  GoKwik Generic-Merchant Full Checkout Suite"
echo "================================================================"

read -r -p "Enter site URL: "                                    INPUT_URL
read -r -p "Enter product name: "                                INPUT_PRODUCT
read -r -p "Enter mobile number: "                               INPUT_PHONE
read -r -p "Enter discount code (Enter to skip): "               INPUT_DISCOUNT
read -r -p "Skip Add-to-Cart, click Buy Now directly? (y/N): "   INPUT_SKIP_ATC

if [ -z "$INPUT_URL" ];     then echo "ERROR: site URL is required" >&2;       exit 1; fi
if [ -z "$INPUT_PRODUCT" ]; then echo "ERROR: product name is required" >&2;   exit 1; fi
if [ -z "$INPUT_PHONE" ];   then echo "ERROR: mobile number is required" >&2;  exit 1; fi

export SITE_URL="$INPUT_URL"
export PRODUCT_NAME="$INPUT_PRODUCT"
export PHONE_NUMBER="$INPUT_PHONE"
[ -n "$INPUT_DISCOUNT" ] && export DISCOUNT_CODE="$INPUT_DISCOUNT"
[[ "$INPUT_SKIP_ATC" =~ ^[Yy] ]] && export SKIP_ATC="true"

echo
echo "Running with:"
echo "  SITE_URL      = $SITE_URL"
echo "  PRODUCT_NAME  = $PRODUCT_NAME"
echo "  PHONE_NUMBER  = $PHONE_NUMBER"
echo "  DISCOUNT_CODE = ${DISCOUNT_CODE:-<unset>}"
echo "  SKIP_ATC      = ${SKIP_ATC:-false}"
echo "  (Order will NOT be placed — flow stops at COD button visibility)"
echo

npx playwright test --headed "$@"
