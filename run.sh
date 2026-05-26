#!/bin/bash
# ---------------------------------------------------------------------------
# run.sh — Interactive runner for the Generic Merchant Suite.
#
# Prompts for the core flow inputs (URL, product, mobile, discount) plus the
# BRD validation inputs (brand colour, prepaid discount, payment methods,
# shipping, COD fees, tax, analytics IDs, COD limits). Every BRD input is
# OPTIONAL — leaving a prompt blank skips the corresponding validation.
#
# The flow stops at "COD button visible" — no order is placed.
# ---------------------------------------------------------------------------
set -e
cd "$(dirname "$0")"

# Reads a prompt and exports the variable if a non-empty value was supplied.
ask() {
  local prompt="$1"; local var="$2"; local default="${3:-}"
  local input
  if [ -n "$default" ]; then
    read -r -p "$prompt [$default]: " input
    input="${input:-$default}"
  else
    read -r -p "$prompt (Enter to skip): " input
  fi
  [ -n "$input" ] && export "$var=$input"
}

# Yes/no prompt — exports y into $var if answered yes, nothing otherwise.
ask_yn() {
  local prompt="$1"; local var="$2"
  local input
  read -r -p "$prompt (y/N, Enter to skip): " input
  if [[ "$input" =~ ^[Yy] ]]; then export "$var=y"; fi
}

# Strict ask — loops until a non-empty value is supplied. Used in BRD mode
# where the user must answer every prompt.
ask_strict() {
  local prompt="$1"; local var="$2"; local default="${3:-}"
  local input
  while true; do
    if [ -n "$default" ]; then
      read -r -p "$prompt [$default]: " input
      input="${input:-$default}"
    else
      read -r -p "$prompt: " input
    fi
    if [ -n "$input" ]; then export "$var=$input"; return; fi
    echo "  (value required)"
  done
}

# Strict y/n — loops until a y or n is explicitly given. y exports the var,
# n leaves it unset (so the matching test step still skips correctly).
ask_yn_strict() {
  local prompt="$1"; local var="$2"
  local input
  while true; do
    read -r -p "$prompt (y/n): " input
    if [[ "$input" =~ ^[Yy] ]]; then export "$var=y"; return; fi
    if [[ "$input" =~ ^[Nn] ]]; then return; fi
    echo "  (please answer y or n)"
  done
}

# Dispatcher — routes BRD prompts to the strict or optional variant based on
# the chosen run mode. Mode 1 = required answers; Mode 2 = Enter-to-skip.
brd_ask()    { if [ "$RUN_MODE" = "1" ]; then ask_strict    "$@"; else ask    "$@"; fi; }
brd_ask_yn() { if [ "$RUN_MODE" = "1" ]; then ask_yn_strict "$@"; else ask_yn "$@"; fi; }

echo "================================================================"
echo "  GoKwik Generic-Merchant Full Checkout + BRD Validation Suite"
echo "================================================================"
echo
echo "Choose a run mode:"
echo "  1) BRD       — every BRD prompt is REQUIRED (you must answer each)"
echo "  2) Direct    — every BRD prompt is OPTIONAL (press Enter to skip any)"
echo "  Both modes walk through the same BRD questions; only enforcement differs."
read -r -p "Mode [1=BRD, 2=Direct] (default 2): " RUN_MODE
RUN_MODE="${RUN_MODE:-2}"

echo
echo "-- Core flow --------------------------------------------------"

read -r -p "Enter site URL: "                                    INPUT_URL
read -r -p "Enter product name: "                                INPUT_PRODUCT
read -r -p "Enter discount code (Enter to skip): "               INPUT_DISCOUNT
read -r -p "Skip Add-to-Cart, click Buy Now directly? (y/N): "   INPUT_SKIP_ATC

if [ -z "$INPUT_URL" ];     then echo "ERROR: site URL is required" >&2;       exit 1; fi
if [ -z "$INPUT_PRODUCT" ]; then echo "ERROR: product name is required" >&2;   exit 1; fi

# Phone + OTP are auto-filled — no prompt. The sandbox phone 9289955127 with
# OTP 1212 is the standard GoKwik test pair every merchant accepts in QA mode.
# Override per-run by exporting PHONE_NUMBER / OTP_VALUE before invoking.
export SITE_URL="$INPUT_URL"
export PRODUCT_NAME="$INPUT_PRODUCT"
export PHONE_NUMBER="${PHONE_NUMBER:-9289955127}"
export OTP_VALUE="${OTP_VALUE:-1212}"
[ -n "$INPUT_DISCOUNT" ] && export DISCOUNT_CODE="$INPUT_DISCOUNT"
[[ "$INPUT_SKIP_ATC" =~ ^[Yy] ]] && export SKIP_ATC="true"

# BRD prompts run in BOTH modes. The dispatcher (brd_ask / brd_ask_yn) routes
# each prompt to its strict variant when RUN_MODE=1 (BRD mode, required) and
# to the optional variant when RUN_MODE=2 (Direct mode, Enter-to-skip).

echo
echo "-- BRD §1: Primary brand colour -------------------------------"
brd_ask "Brand primary colour hex (e.g. #FF6B00)"        BRAND_COLOR_HEX

echo
echo "-- BRD §2: Prepaid discount -----------------------------------"
brd_ask_yn "Validate prepaid discount?"                  PREPAID_DISCOUNT_ENABLED
if [ -n "$PREPAID_DISCOUNT_ENABLED" ]; then
  brd_ask "  Scope (all | upi)"                          PREPAID_DISCOUNT_SCOPE      "all"
  brd_ask "  Type (flat | percent)"                      PREPAID_DISCOUNT_TYPE       "flat"
  brd_ask "  Value (number)"                             PREPAID_DISCOUNT_VALUE
  brd_ask "  Capping amount (only if percent)"           PREPAID_DISCOUNT_CAP
  brd_ask "  Min cart value above which applicable"      PREPAID_DISCOUNT_MIN_CART
fi

echo
echo "-- BRD §3: Payment methods enabled ----------------------------"
brd_ask "Comma-separated payment methods (UPI,COD,PPCOD,Cards,Netbanking,Wallets,Snapmint,EMI)" PAYMENT_METHODS

echo
echo "-- BRD §4: Discount list shown on checkout --------------------"
brd_ask "Comma-separated coupon codes the merchant expects to be visible" EXPECTED_DISCOUNT_CODES

echo
echo "-- BRD §5: Shipping -------------------------------------------"
brd_ask "Shipping line name on checkout (e.g. Standard Delivery)" SHIPPING_NAME
brd_ask "Shipping price"                                          SHIPPING_PRICE

echo
echo "-- BRD §6: COD fees -------------------------------------------"
brd_ask_yn "COD fee charged?"                            COD_FEE_ENABLED
if [ -n "$COD_FEE_ENABLED" ]; then
  brd_ask "  COD fee value (integer)"                    COD_FEE_VALUE
fi

echo
echo "-- BRD §8: Tax setup ------------------------------------------"
brd_ask_yn "Show tax on checkout order summary?"         TAX_SHOW_ON_CHECKOUT
brd_ask_yn "Tax inclusive (vs exclusive)?"               TAX_INCLUSIVE

echo
echo "-- BRD §9-11: Analytics IDs -----------------------------------"
brd_ask "GA4 Measurement ID (e.g. G-XXXXXXX)"            GA4_MEASUREMENT_ID
brd_ask "Meta Pixel ID"                                  META_PIXEL_ID
brd_ask "Google Ads ID (e.g. AW-XXXXXXX)"                GADS_ADWORDS_ID
brd_ask "GAds purchase conversion label"                 GADS_PURCHASE_LABEL
brd_ask "GAds begin_checkout conversion label"           GADS_BEGIN_CHECKOUT_LABEL

echo
echo "-- BRD §12: COD limit -----------------------------------------"
brd_ask "COD lower limit"                                COD_LIMIT_LOWER
brd_ask "COD upper limit"                                COD_LIMIT_UPPER

echo
echo "Running in $([ "$RUN_MODE" = "1" ] && echo BRD || echo Direct) mode."
echo "Running with:"
echo "  SITE_URL                 = $SITE_URL"
echo "  PRODUCT_NAME             = $PRODUCT_NAME"
echo "  PHONE_NUMBER             = $PHONE_NUMBER  (auto)"
echo "  OTP_VALUE                = $OTP_VALUE  (auto)"
echo "  DISCOUNT_CODE            = ${DISCOUNT_CODE:-<unset>}"
echo "  SKIP_ATC                 = ${SKIP_ATC:-false}"
echo "  BRAND_COLOR_HEX          = ${BRAND_COLOR_HEX:-<skip>}"
echo "  PREPAID_DISCOUNT_ENABLED = ${PREPAID_DISCOUNT_ENABLED:-<skip>}"
echo "  PAYMENT_METHODS          = ${PAYMENT_METHODS:-<skip>}"
echo "  EXPECTED_DISCOUNT_CODES  = ${EXPECTED_DISCOUNT_CODES:-<skip>}"
echo "  SHIPPING_NAME / PRICE    = ${SHIPPING_NAME:-<skip>} / ${SHIPPING_PRICE:-<skip>}"
echo "  COD_FEE                  = ${COD_FEE_ENABLED:-<skip>} ${COD_FEE_VALUE:-}"
echo "  TAX_SHOW_ON_CHECKOUT     = ${TAX_SHOW_ON_CHECKOUT:-<skip>}"
echo "  TAX_INCLUSIVE            = ${TAX_INCLUSIVE:-<skip>}"
echo "  GA4_MEASUREMENT_ID       = ${GA4_MEASUREMENT_ID:-<skip>}"
echo "  META_PIXEL_ID            = ${META_PIXEL_ID:-<skip>}"
echo "  GADS_ADWORDS_ID          = ${GADS_ADWORDS_ID:-<skip>}"
echo "  COD_LIMIT                = ${COD_LIMIT_LOWER:-<skip>} - ${COD_LIMIT_UPPER:-<skip>}"
echo "  (Order will NOT be placed — flow stops at COD button visibility)"
echo

npx playwright test --headed "$@"
