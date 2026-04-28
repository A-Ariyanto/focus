# Focus Data Schema

## Storage Overview

The extension uses chrome.storage as the persistence layer.

### chrome.storage.local

#### Usage data

Key pattern: `usage_YYYY-MM-DD`

Shape:

```json
{
  "youtube.com": 45000,
  "github.com": 120000,
  "docs.google.com": 30000
}
```

Meaning:

- Each key is a normalized domain name.
- Each value is the accumulated time spent on that domain in milliseconds.
- One record exists per day.

#### Blocklist

Key: `blocklist`

Shape:

```json
["facebook.com", "x.com", "reddit.com"]
```

Meaning:

- Each entry is a normalized domain string.
- Subdomains are matched against the stored base domain.

### chrome.storage.sync

#### Settings

Key: `settings`

Shape:

```json
{
  "blockingEnabled": true
}
```

Meaning:

- Controls whether the blocker is active.
- Currently the schema is intentionally small so it stays within sync storage limits.

## Normalization Rules

- Domains are stored lowercased.
- `www.` is removed before storage and comparison.
- Usage data is keyed by the current local date in `YYYY-MM-DD` format.

## Validation Rules

- Blocked domains must contain at least one dot and be at least three characters long.
- Storage reads should fall back to empty defaults when keys are missing.
- UI state should treat storage as eventually consistent and refresh on `chrome.storage.onChanged`.
