# Focus Design Process

This document captures how the extension UI and interaction model were shaped.

## 1. Product Goal

Focus is a digital wellbeing extension that helps users reduce distraction by:

- tracking time spent on websites
- blocking distracting domains
- showing a calm, clear blocked-page experience
- keeping controls close at hand in the popup

The design goal was not to make the UI look like a dashboard product. It needed to feel lightweight, direct, and calm enough to support focus rather than compete for attention.

## 2. Design Principles

The UI follows a few consistent principles:

- Low friction: common actions should be visible in one place.
- Soft visual contrast: the interface should feel modern without becoming noisy.
- Clear hierarchy: tracking data, blocking controls, and feedback states should be easy to distinguish.
- Extension-native behavior: the UI must work within Chrome extension constraints, especially CSP and asset loading rules.

## 3. Information Architecture

The popup is split into two primary views:

- Dashboard: shows today's screen time and the top sites by usage.
- Blocklist: manages the blocked domains list and the global blocking toggle.

The blocked page is separate from the popup because it serves a different task: it interrupts distraction and reassures the user without asking for setup or navigation.

## 4. Visual Direction

The visual language uses:

- dark slate backgrounds with gradient accents
- glass-like cards for compact data panels
- violet and cyan accents to suggest energy and clarity
- rounded shapes and subtle motion for a calmer feel

The blocked page uses the same visual direction, but it is intentionally simpler. Its job is to be readable in one glance and get out of the way.

## 5. Interaction Design

The interaction model is built around small, immediate actions:

- switch between Dashboard and Blocklist with tabs
- add or remove blocked domains from the popup
- toggle blocking on or off with one control
- show blocked-page context based on the URL that was interrupted

Feedback is kept short and direct. Loading states, error states, and empty states are explicit so the user can tell whether the extension is working.

## 6. Technical Design Choices

The implementation reflects the design goals:

- React is used for popup and blocked-page UI composition.
- Plain background and content scripts are kept for navigation blocking and tracking logic.
- chrome.storage.local stores usage and blocklist data.
- chrome.storage.sync stores settings so the blocker state follows the user.
- The blocked page uses a strict CSP and local assets only.

These choices keep the UI flexible while preserving the reliability required by a browser extension.

## 7. Iteration Notes

The current UI is the result of moving from a vanilla blocked page to a React-based extension entry. That change made the blocked page easier to maintain, but it also required careful handling of build output paths so the popup and blocked page continue to load correctly inside the extension.

## 8. What This Design Optimizes For

This design prioritizes:

- speed of recognition
- low cognitive load
- easy maintenance
- security compliance
- room for future expansion

## 9. Related Documents

- Architecture decisions: [adr.md](../adr.md)
- Storage model: [schema.md](../schema.md)
- Project overview: [README.md](../README.md)
