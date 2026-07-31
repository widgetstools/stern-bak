#!/usr/bin/env bash
# Bulk-rewrite legacy @wellsfargo-starui/* import paths to the refactored @wellsfargo-starui/* layout.
set -euo pipefail

rewrite() {
  find "$1" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 \
    | xargs -0 sed -i '' \
      -e 's/@wellsfargo-starui\/config-service/@wellsfargo-starui\/host-config/g' \
      -e 's/@wellsfargo-starui\/shared-types/@wellsfargo-starui\/types/g' \
      -e 's/@wellsfargo-starui\/core/@wellsfargo-starui\/engine/g' \
      -e 's/@wellsfargo-starui\/markets-grid/@wellsfargo-starui\/grid/g' \
      -e 's/@wellsfargo-starui\/grid-react/@wellsfargo-starui\/grid\/customizer/g' \
      -e 's/@wellsfargo-starui\/data-services-react/@wellsfargo-starui\/host-data-react/g' \
      -e 's/@wellsfargo-starui\/data-services/@wellsfargo-starui\/host-data/g' \
      -e 's/@wellsfargo-starui\/runtime-port/@wellsfargo-starui\/host/g' \
      -e 's/@wellsfargo-starui\/runtime-browser/@wellsfargo-starui\/host-browser/g' \
      -e 's/@wellsfargo-starui\/runtime-openfin/@wellsfargo-starui\/host-openfin/g' \
      -e 's/@wellsfargo-starui\/widgets-react/@wellsfargo-starui\/widgets/g' \
      -e 's/@wellsfargo-starui\/icons-svg\/react/@wellsfargo-starui\/config-browser\/icons/g' \
      -e 's/@wellsfargo-starui\/icons-svg/@wellsfargo-starui\/config-browser\/icons/g'
}

rewrite "${1:?usage: port-legacy.sh <dir>}"
