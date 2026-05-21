# ShopPilot Architecture Diagrams

This page is the recruiter-friendly view of the architecture diagrams.

## 1) System Context
![System Context](01-system-context.svg)

Source: `01-system-context.mmd`

## 2) Runtime Containers
![Runtime Containers](02-runtime-containers.svg)

Source: `02-runtime-containers.mmd`

## 3) Checkout Sequence
![Checkout Sequence](03-checkout-sequence.svg)

Source: `03-checkout-sequence.mmd`

## 4) AI Assistant Sequence
![AI Assistant Sequence](04-ai-assistant-sequence.svg)

Source: `04-ai-assistant-sequence.mmd`

## 5) ERD Lite
![ERD Lite](05-erd-lite.svg)

Source: `05-erd-lite.mmd`

## Regenerate SVGs
```bash
for f in "docs/architecture diagrams"/*.mmd; do
  npx -y @mermaid-js/mermaid-cli -i "$f" -o "${f%.mmd}.svg"
done
```
