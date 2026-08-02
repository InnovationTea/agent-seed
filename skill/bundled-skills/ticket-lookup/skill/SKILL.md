---
name: ticket-lookup
description: Use when a user asks to view, query, retrieve, or summarize an SR or AR ticket by its identifier from the configured requirements-management site.
---

# Ticket Lookup

Retrieve ticket content through the configured requirements-management site. This workflow is read-only except for the bounded prefilled-login submission described below.

## Trigger

Use this skill when the user asks to view, query, retrieve, inspect, or summarize one or more SR or AR ticket identifiers, such as `SR123456` or `AR12345`.

Match identifiers case-insensitively, normalize them to uppercase, and de-duplicate them while preserving the user's order. Do not invoke this skill for unrelated text that merely contains `SR` or `AR`.

## Configuration

Resolve the requirements-management URL from the project root in this order:

1. `.agents/ticket-lookup.local.json`
2. `.agents/ticket-lookup.json`

Each file has this schema:

```json
{
  "requirement_management_url": "https://requirements.example.internal",
  "allow_prefilled_login_submit": true
}
```

The shared `.agents/ticket-lookup.json` is team configuration and may be committed. `.agents/ticket-lookup.local.json` is an optional machine-specific override. Before creating the local override, ask for approval to add `.agents/ticket-lookup.local.json` to the target project's `.gitignore`.

The local file replaces the shared file's `requirement_management_url`. `allow_prefilled_login_submit` defaults to `true`; set it to `false` when this project requires manual login. Never hard-code a requirements-management URL in this skill. Do not store credentials, cookies, tokens, browser-profile paths, or personal account information in either configuration file.

Stop and report the required file and field when neither configuration file provides an absolute `http://` or `https://` `requirement_management_url`.

## Lookup Workflow

1. Identify the requested SR and AR ticket identifiers.
2. Resolve the configured URL before opening a browser.
3. Confirm that the configured browser-automation skill is available. When it is missing, explain that browser retrieval depends on the configured external integration and request approval to follow its installation flow. Do not mark the ticket as read.
4. Use the configured browser-automation skill to open the configured URL. Reuse an authenticated browser session when available. Do not install an extension, configure the browser, or type credentials.
5. If the site shows a login page and `allow_prefilled_login_submit` is `true` (the default), and the browser visibly shows the username and password fields already populated, click the site's login button once without reading or filling either value. If the option is `false`, stop and ask the user to log in. Do not retry. Hand MFA, CAPTCHA, consent, or any unexpected page to the user.
6. Search the visible site UI for each requested identifier and extract the content relevant to the user's question.
7. Report found, not-found, inaccessible, and browser/session failures separately for each ticket.

## Safety

Only perform read-only browser actions except for the single prefilled-login button click allowed above. Do not create, edit, comment on, transition, submit, delete, or otherwise modify ticket data. Never read, copy, log, or transmit credential values.
