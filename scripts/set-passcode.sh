#!/bin/bash
# Set your own passcode for the hosted copy: asks for it (hidden), saves it in .env,
# sets it on Vercel, and redeploys. Browsers logged in with the old passcode are logged out.
set -e
cd "$(dirname "$0")/.."

read -rsp "New passcode: " pc; echo
if [ ${#pc} -lt 8 ]; then echo "Use at least 8 characters. Nothing changed."; exit 1; fi
read -rsp "Type it again: " again; echo
if [ "$pc" != "$again" ]; then echo "They don't match. Nothing changed."; exit 1; fi

tmp=$(mktemp)
grep -v '^STRUM_PASSCODE=' .env > "$tmp" || true
printf 'STRUM_PASSCODE=%s\n' "$pc" >> "$tmp"
mv "$tmp" .env

echo "Setting it on Vercel…"
for env in production preview; do
  printf %s "$pc" | npx --yes vercel@latest env add STRUM_PASSCODE "$env" --force > /dev/null 2>&1
done
echo "Redeploying (about half a minute)…"
npx --yes vercel@latest deploy --prod --yes > /dev/null 2>&1
echo "Done. Open https://struum.vercel.app and use your new passcode."
