# LeetTrace monetization plan

Updated: 2026-09-07
Status: product proposal and tracking document. No billing, accounts, paid limits,
or subscription enforcement have been implemented or authorized by this plan.

## Product direction

Keep LeetTrace useful as a complete free visual debugger. Charge for additional
learning assistance and cloud convenience that people choose because it helps
them prepare and understand their own code.

User priorities:

- Do not force users to pay to get the core benefit.
- Make the paid version meaningfully useful.
- Keep the price accessible to students and occasional interview candidates.
- Source repositories may be private. Feedback must not depend on repo access.

Recommendation: one free tier and one optional Pro tier. Avoid building several
pricing tiers before anyone has paid for the first one.

## What remains free

These are product commitments proposed for approval, not limits already enforced:

- Existing local Python execution, structure visualizations, pointers, and call stacks.
- Selected and custom LeetCode testcases, including automatic retracing.
- Step forward/back, playback, timeline scrubbing, and readable variables.
- Error-state inspection, stdout, pattern hints, and editor synchronization.
- Core correctness fixes, accessibility improvements, and support/bug reporting.
- No account required for local tracing.
- No artificial daily trace quota. Execution/memory safety budgets remain for
  everyone; buying Pro should not be necessary to trace an ordinary solution.

Future basic local save/export should also be free. These are not built yet.
Do not remove a shipped free feature later simply to make Pro more attractive.

## Paid features worth validating

| Priority | Candidate | Why someone might pay | Implementation boundary | Status |
|---|---|---|---|---|
| 1 | Saved study sessions with cloud sync | Resume a difficult problem on another device with the exact testcase, trace, bookmarks, and personal notes | Extension captures/renders; server stores per-user records and checks ownership | Proposed |
| 1 | Explain this step | Ask why a branch ran, a pointer moved, or a value changed, grounded in the user's actual recorded execution | Extension selects context; server checks allowance and calls an AI provider | Proposed |
| 2 | Explain this failure | Explain a concrete exception or supplied expected/actual mismatch and suggest a targeted next debugging step | Build on step explanations; never call a result wrong without an expected value or other evidence | Proposed |
| 2 | Private replay links for a tutor or study partner | Share a reproducible trace with notes, without setting up the project | Server stores snapshots and controls link access/revocation; viewer renders the trace | Proposed |
| Later | Compare two saved approaches | Understand behavior and operation-count differences on the same input | Client comparison UI plus saved server records; align meaningful events, not raw step numbers | Research |
| Later | Tutor/classroom workspace | Organize annotated examples and give feedback to multiple learners | Separate organization/member access model | Defer until requested |

The strongest initial bundle is **saved study sessions + trace-specific
explanations**. Cloud storage alone may not justify a subscription for occasional
users. Generic chatbot answers alone may not be compelling either: the differentiator
is understanding the precise execution the user is already looking at.

Start by validating these two benefits with users before building the whole list.

### What good step explanations should do

- Refer to concrete line numbers, values, and the active function call.
- Explain before-line versus after-line state accurately.
- Distinguish observed execution facts from an inferred algorithm invariant.
- Offer a small hint before offering a full solution.
- Admit missing context rather than inventing an expected answer.
- Avoid claims of proven complexity or correctness based on one execution.
- Send only user-approved code/trace context; local tracing should remain local.

## Affordable pricing hypothesis

All amounts below are proposed USD prices to test, not market facts or announced
offers.

| Offer | Starting hypothesis | Conditions |
|---|---|---|
| Free | $0 | Complete local tracer; no account or artificial daily quota |
| Pro monthly | $4/month | Cloud study workspace plus a clearly stated explanation allowance |
| Pro annual | $30/year | About $2.50/month; offer only after retention and costs are understood |
| Optional supporter contribution | Consider later | A voluntary way to support the free tool; no pressure or functionality loss |

Do not launch all billing options immediately. First test willingness to pay for
the $4 monthly bundle. If most users only prepare for interviews for a short
period, later test a nonrenewing study pass instead of assuming everyone wants
an annual subscription.

Do not promise unlimited AI, unlimited storage, or lifetime cloud access.
A possible pilot allowance is 30 explanations per month, but this is a placeholder:
measure real token usage, response quality, and costs before setting or publishing
the allowance. Users must see what remains before they run out. No surprise
overage charges.

A tiny free explanation sample could help people assess Pro without entering a
card. Add it only after abuse prevention and its total cost are understood.
Exhausting that sample must never affect free tracing.

## Fair upgrade and cancellation experience

- Show Upgrade when a user intentionally opens a Pro capability or account page.
- No interruptions in the middle of tracing, fake scarcity, or repeated nagging.
- Make the full monthly/yearly charge clear; do not advertise only an annual
  price divided by 12 while hiding the actual up-front payment.
- Easy cancellation and an explicit end-of-access date.
- On downgrade, keep local tracing unchanged. Define read/export access to saved
  sessions and a disclosed retention period before collecting paid cloud data.
- No automatic uploads of source code or personal notes.
- No sale of code or browsing history to subsidize the free tier.
- Bug reporting stays available to everyone.
- Validate explanation quality, not merely how often people click the button.

## Code and service split

The extension and server can live in one private repository with separate folders
and deployments. Repository privacy does not conceal code shipped in the extension.

Suggested future layout (not created yet):

```text
extension/          Current Chrome extension, Pyodide, visualizers, and account UI
server/             Authentication integration, paid APIs, billing webhooks, storage
shared/             Request/response schemas with no secrets
docs/               Product decisions, operating notes, and monetization tracking
```

| Extension responsibility | Server responsibility |
|---|---|
| Extract selected code/testcase and execute Python locally | Authenticate paid API requests |
| Build and render trace context | Determine actual subscription entitlement |
| Let users choose what to save/share/explain | Enforce quotas and per-user access rules |
| Open hosted sign-in, checkout, and account management | Verify payment-provider webhook signatures and process events idempotently |
| Display plan and allowance returned by the API | Store subscription state, usage, cloud sessions, and share permissions |
| Display explanations as data | Keep AI/payment secrets and provider calls on the server |

Pro access must be checked on every protected server operation, including
ownership of saved traces. A local boolean such as `isPro` is only UI state,
not an authorization boundary. Client-only paid features can be patched by a
determined user; do not base the business on hiding JavaScript.

Keep Python execution local initially. Moving untrusted user code to your server
adds isolation, resource-control, and operating costs without automatically adding
user value. An AI explanation service can consume recorded trace data without
running the user's Python.

Billing sequence: Upgrade → hosted checkout → verified server webhook →
subscription record → authorized paid requests. Handle duplicate/out-of-order
webhooks and cancellation/payment failures. Do not grant paid access solely
because a browser redirected to a success URL.

All extension-executed JavaScript/WASM stays bundled. Server endpoints return
results/data; they must not act as a way to download hidden executable premium
modules. See Chrome's remotely hosted code guidance in Sources.

## Cost check before choosing an allowance

Track this per paid account, at both monthly and annual effective prices:

```text
revenue
- payment and subscription-processing fees
- AI usage (input/output tokens, retries, and provider errors)
- storage, requests, and bandwidth
- refunds and support allowance
= contribution before fixed expenses and taxes
```

For an illustrative US domestic-card calculation, Stripe currently lists
2.9% + $0.30 per successful transaction:

- A $4 charge leaves about $3.58 after that processing fee alone.
- A $30 annual charge leaves about $28.83/year, or $2.40/month averaged.

These figures exclude Billing fees, hosting, AI, tax, refunds, and other payment
methods/countries. They are not a forecast or a processor selection. Verify
applicable fees before launch.

Proposed guardrail: aim to keep variable infrastructure/AI costs below roughly
20–25% of collected revenue, then assess whether the remainder covers support
and fixed expenses. This is a planning target, not an established industry rule.
Measure high-usage accounts, not just the average. Revisit price or allowance
before selling a plan that costs more to serve than it earns.

## Validation and delivery checklist

### Now — free product and feedback

- [x] Keep existing local tracing features available without a paywall.
- [x] Connect the panel feedback link to https://tally.so/r/2EWO8D.
- [ ] Owner: enable Tally self email notifications.
- [ ] Owner: submit a clearly marked test response and verify email delivery.
- [ ] Complete the live LeetCode compatibility checklist in PROGRESS.md.
- [ ] Collect feedback on repeated learning/debugging problems, not just requested features.

### Validate a paid benefit

- [ ] Talk to a small initial group (suggestion: 10 active users).
- [ ] Ask how often they revisit traces or switch devices.
- [ ] Show examples of a trace-specific explanation and saved study session.
- [ ] Ask which benefit, if any, is worth $4/month; record objections.
- [ ] Test willingness to pay with a clearly described pilot, not a misleading live checkout.
- [ ] Benchmark explanation quality, latency, and per-request cost on representative traces.
- [ ] Decide the initial bundle and allowance based on that evidence.

### Build only after that decision

- [ ] Add account/session handling and server-side authorization.
- [ ] Implement cloud sessions with ownership checks, export, deletion, and storage limits.
- [ ] Implement grounded step explanations with usage accounting and rate limits.
- [ ] Test with a small invited pilot before adding billing.
- [ ] Select a payment provider and verify applicable fees.
- [ ] Add hosted checkout, signed webhook handling, cancellation, and plan/usage UI.
- [ ] Document cloud/AI data handling and retention before public launch.
- [ ] Validate access control, downgrade behavior, provider outages, and duplicate payments.
- [ ] Choose whether monthly-only or monthly + annual pricing fits actual usage.

## Decision log

| Date | Decision / hypothesis | Evidence / follow-up |
|---|---|---|
| 2026-09-07 | Core visual debugging should stay free | User explicitly wants optional, affordable paid value |
| 2026-09-07 | Use Tally for feedback, independent of repository visibility | User supplied published form URL; HTTP reachability verified without submission |
| 2026-09-07 | Prefer cloud study sessions + grounded explanations as initial paid bundle | Recommendation; needs user validation |
| 2026-09-07 | Test $4/month; consider $30/year after validating costs | Pricing hypothesis; no billing implementation or published commitment |

## Sources and operational links

External facts checked on 2026-09-07. Product ideas and proposed prices above are
recommendations, not claims about what users will buy.

- Feedback form: https://tally.so/r/2EWO8D
- Free owner email alerts: https://tally.so/help/self-email-notifications
- Stripe payment pricing (illustrative fees): https://stripe.com/pricing
- Subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Chrome remote-code guidance: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
