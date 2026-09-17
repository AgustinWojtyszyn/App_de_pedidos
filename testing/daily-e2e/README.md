# Daily orders UI verification

Run Vite on port 4173, then the browser check:

```sh
npm run dev -- --host 127.0.0.1 --port 4173
# In another terminal, with Playwright installed in your testing environment:
node testing/daily-e2e/check-workspace.mjs
```

An existing Playwright installation can be used without changing project dependencies:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node testing/daily-e2e/check-workspace.mjs
```

The check mounts the real `DailyOrders` component at `/daily-orders` in an isolated test document. It replaces the data hook with a deterministic fixture, records export callbacks, and intercepts every external HTTP request. It does not authenticate, write orders, send WhatsApp messages, or test live Supabase integrations. Dialogs and secondary panels are the real components; their external data responses are empty fixtures.

Coverage: date navigation and reset of filters; all five filters; secondary navigation; opening extra, late extra and discount dialogs; export company and callbacks; archive/cancel callbacks; role-gated actions; empty/error/restricted states; desktop table and mobile cards at 1920, 1440, 1366, 1024, 768, 390 and 320 pixels; print-only/print-hide visibility and a generated print PDF. Existing unit tests cover the underlying business and export logic.

Screenshots and the PDF are saved outside the repository at `/tmp/servifood-daily-ui`. Override `DAILY_UI_URL` or `DAILY_UI_OUTPUT` as needed.
