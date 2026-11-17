# Test Run Report: Local sign-in — 2026-11-17T16:45:52Z

## Summary
- Scope: local sign-in form, validation, and frontend error handling
- New tests: 7 passed, 0 failed, 0 skipped
- Fix cycles used: 1 (one automation issue fixed and verified)
- Layers run: ui
- Verdict: All 7 Playwright tests passed in the final entire-suite run; backend integration was intentionally not tested.

## Results
| Test | Layer | Status | Reason | Bucket | Gap flag |
|---|---|---|---|---|---|
| renders the local login form (`tests/auth/ui/login.spec.ts:23`) | ui | passed | Form heading, labelled inputs, and submit control rendered. | — | none |
| blocks submission when required fields are empty (`tests/auth/ui/login.spec.ts:32`) | ui | passed | Native required validation prevented a login request. | — | none |
| blocks submission when the email is malformed (`tests/auth/ui/login.spec.ts:49`) | ui | passed | Native email validation prevented a login request. | — | none |
| accepts valid credentials and navigates to the account page (`tests/auth/ui/login.spec.ts:66`) | ui | passed | Payload matched and mocked success navigated to account. | — | none |
| shows the credential rejection message after a 401 response (`tests/auth/ui/login.spec.ts:100`) | ui | passed | Credential rejection message displayed. | — | none |
| shows the generic retry message after an unexpected server response (`tests/auth/ui/login.spec.ts:114`) | ui | passed | Generic error displayed after HTTP 500. | — | none |
| shows the generic retry message when the login request fails at network level (`tests/auth/ui/login.spec.ts:128`) | ui | passed | Generic error displayed after an aborted request. | — | none |

## Entire suite
- Scope run: all files under `tests/` via `tests/playwright.config.ts`, UI layer, in 1 part. This was the only Playwright spec in the repository.
- Totals: 7 passed, 0 failed, 0 skipped
- Verdict: All good

| Test | Layer | Bucket | Cause (one line) | New or pre-existing |
|---|---|---|---|---|
| All 7 tests listed above | ui | — | Passed on the video-recording entire-suite run. | New |

## Defect Reports
None.

## Automation Drift fixes
| Test | File:line | Old locator or wait | New locator or wait | Why more resilient | Result (cycle) |
|---|---|---|---|---|---|
| Required and malformed email validation | `tests/auth/ui/login.spec.ts:42, 58` | Unsupported `toBeInvalid()` matcher from this Playwright package | Read native `HTMLInputElement.validity.valid` and assert `false` | Directly asserts the browser's constraint-validation state without adding a dependency or weakening the behavior assertion. | Both affected tests passed on targeted re-run, cycle 1; all 7 passed in the final suite. |

## Gaps
- Requirement gaps: No password policy or maximum email/password lengths are specified; those boundaries were not asserted.
- Code gaps: None identified for the tested scenarios.

## Files written
- `tests/auth/ui/login.spec.ts`
- `tests/playwright.config.ts` (video-only configuration)
- `.revolte/artifacts/report.md`
- Test account: synthetic email/password values used only with mocked API responses; no real account or database records were created.

## Evidence
- Videos (entire-suite run):
  - `.revolte/artifacts/login-renders-the-local-login-form.webm`
  - `.revolte/artifacts/login-blocks-submission-when-required-fields-are-empty.webm`
  - `.revolte/artifacts/login-blocks-submission-when-the-email-is-malformed.webm`
  - `.revolte/artifacts/login-accepts-valid-credentials-and-navigates-to-the-account-page.webm`
  - `.revolte/artifacts/login-shows-the-credential-rejection-message-after-a-401-response.webm`
  - `.revolte/artifacts/login-shows-the-generic-retry-message-after-an-unexpected-server-response.webm`
  - `.revolte/artifacts/login-shows-the-generic-retry-message-when-the-login-request-fails-at-network-level.webm`

## Not verified / remaining risks
- Tests stub `/auth/status`, `/auth/login`, and the account orders request. They do not establish actual API behavior, session persistence, or database-backed login; this was explicitly excluded at the user's direction.
- Google OAuth, registration, account lockout/rate limiting, password-policy boundaries, and authenticated downstream behavior were not tested.
- The final run's frontend log reported `Something is already running on port 3000`; the reachable local frontend served the suite. The test-runner cleanup did not fully stop the earlier dev-server process, so it may still be running.

## Other observations (not tested)
- `npm ci` reported 73 dependency audit findings (14 low, 16 moderate, 39 high, 4 critical). No dependency changes or audit fixes were made as part of this QA task.
