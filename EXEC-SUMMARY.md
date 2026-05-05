# Project Aura — Executive Summary

**One-line:** Voice-native iOS assistant that discovers nearby Bluetooth devices and answers troubleshooting questions about them, using Anthropic Claude grounded in live web search of manufacturer documentation.

**Status:** Paused. The end-to-end experience works. The load-bearing piece — accurately identifying any Bluetooth device from passive broadcast metadata — has a hard physical-layer ceiling we cannot prompt-engineer past. We can demo the full UX, but in any real-world test, a meaningful fraction of devices come back as "Unknown" or with low-confidence guesses for make and model.

---

## What we built

- **iOS app** running on a physical iPhone via Expo Dev Client, three tabs:
  - *Radar* — passive BLE scan capped at 100 devices, two-phase flow (scan → identify), live progress, devices grouped by category
  - *Spaces* — assign devices to physical zones via RSSI calibration
  - *Steward* — press-and-hold mic, ask a troubleshooting question, hear a spoken answer with citations to manufacturer support pages
- **Cloudflare Worker proxy** — single edge function fronting Claude Opus 4.7 (with the `web_search` tool) and OpenAI Whisper. No third-party keys ever ship in the mobile binary
- **Local categorization fallbacks** — Apple Continuity packet decoder and Bluetooth SIG service-UUID dictionary, so devices get a useful label even when the LLM can't identify them
- **Privacy by design** — no cloud database, PII scrubbing before transmission (e.g., "Josh's AirPods" → "AirPods"), only the first 8 hex characters of manufacturer data leave the device

The voice round-trip — mic press → Whisper transcription → Claude with web search → iOS TTS playback — runs in 3–6 seconds end-to-end and produces citations to real manufacturer URLs.

---

## Why identification is hard

We classify devices using only what they broadcast in BLE advertising packets. That's:

- **2-byte manufacturer ID** (e.g., Apple = `0x004C`)
- **~6–8 bytes of vendor-specific data** — undocumented and proprietary; the same packet shape covers entire product lines
- **Optional human-readable name** — most modern devices broadcast nothing here for privacy reasons (iPhones, AirPods on standby, most smart-home devices)
- **Service UUIDs** — only reveal *capability classes* (e.g., "battery service"), not specific products

What we **cannot** get from a passive scan, no matter how clever the LLM:

- Hardware MAC address — iOS hides it
- Specific make and model — the bytes simply don't carry that information
- Firmware version, serial number, or any GATT characteristic — those require an active connection
- Stable identity over time — iOS rotates peripheral UUIDs every ~15 minutes by design

The LLM is bounded by what we can give it. Claude can guess that `manufacturer=Apple, services=[180F], Continuity subtype 0x07` is "some AirPods variant," but it cannot tell you whether it's AirPods Pro 1 or 2 from the broadcast alone — that information isn't there. In testing with ~30 devices, 30–50% came back as "Unknown" or with confidence below 0.5.

---

## Three paths to make this actually useful

**1. Active GATT discovery** *(weeks of work)*
Connect to each device on user request and read the standard Device Information Service (`0x180A`): manufacturer name, model number, hardware revision, firmware revision, serial number — all populated by the device itself.
*Costs:* battery, permission prompts, won't work for devices already connected to another phone (e.g., AirPods paired to iPhone), some devices reject unauthenticated reads.

**2. A first-party device fingerprint database** *(6–9 months, plus ongoing)*
Build a real-world dataset mapping `(manufacturer prefix, service UUIDs, broadcast pattern) → make/model` from captured devices, beating the LLM via lookup. Asurion is uniquely positioned to do this — we see millions of devices in repair and protection flows. Public databases of this quality do not exist; this would become a defensible asset.
*Costs:* device lab or large user-contributed dataset, ETL pipeline, ongoing maintenance as new devices ship.

**3. Pivot the user model** *(weeks of work)*
Drop "passively discover anything." Have the user add their devices manually once (or via NFC tap / QR code), then the app provides BLE proximity tracking, voice troubleshooting, and zone organization on a *known* fleet. Identification stops being load-bearing because the user already told us what they own.
*Costs:* less magical first-run experience.

---

## Recommendation

For a customer-facing product the fastest credible path is **option 3** — lean on user-provided device identity, use BLE for proximity and presence, use Claude for the troubleshooting voice flow we've already proven works. We ship in weeks instead of quarters.

For a strategic moat, **option 2** is the play. A real device fingerprint database is the kind of asset that compounds — every customer interaction makes it more accurate, and no competitor has it.

Either way, the Worker, voice round-trip, and grounded-answer plumbing we've built carry forward unchanged. The work is not wasted; it's just waiting on a better identification source than what BLE passive scanning can give us.

---

*If you'd like to advance this work, the codebase is open at [github.com/joshua-burnell-1/aura](https://github.com/joshua-burnell-1/aura) — fork the repo and pursue one of the paths above.*
