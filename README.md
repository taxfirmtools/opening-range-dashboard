# Opening range

A desktop dashboard for the first 15 minutes of the US equity session. It records the high and low from **9:30:00 through 9:44:59 America/New_York** and shows whether the latest price is above that range, below it, or still inside. Names outside the range are highlighted and sorted to the top.

## Run

```bash
npm install
DASHBOARD_PASSWORD='choose-a-password' npm run dev
```

Open http://localhost:5173 and enter that password. `npm test` checks the session clock and the opening-range math. `npm run build && npm start` serves the production build. The password section below explains the variable.

## Password

One shared password protects the page and the market-data API. There are no accounts, no email, and no password reset. Everyone who should see the dashboard uses the same password. It is read from the `DASHBOARD_PASSWORD` environment variable. It is not stored in this repo.

If that variable is missing or blank, the site shows a setup message and does not open the dashboard.

### On your computer

Stop the server, then start it with the variable set:

```bash
DASHBOARD_PASSWORD='choose-a-password' npm run dev
```

You can also export it in the same terminal and then start the app:

```bash
export DASHBOARD_PASSWORD='choose-a-password'
npm run dev
```

Use a password you are willing to share with the people who should see the page. Restart after you change it. Sign-in lasts until the browser is closed.

Do not commit the password. Do not put it in a `VITE_` variable. Those are sent to the browser. A plain `.env` file is optional only if your host or shell loads it into the server process. This app does not read a `.env` file by itself.

### On Netlify

The site is set up for Netlify in `netlify.toml`. The password is the `DASHBOARD_PASSWORD` environment variable in the Netlify UI. It is not written in the repo.

1. Open [https://app.netlify.com](https://app.netlify.com) and sign in. Create a Netlify account there if you need one.
2. Click **Add new site**, then **Import an existing project**.
3. Choose **GitHub**. If asked, authorize Netlify. Select the **taxfirmtools/opening-range-dashboard** repository. Do not select CYoung.
4. For the branch, use **main** after this change is merged. To preview the branch first, pick that branch instead.
5. Leave the build settings Netlify reads from `netlify.toml`: build command `npm run build`, publish directory `dist`. If those boxes are empty, fill in those two values. Node 22 is already set in the config.
6. Open **Site configuration** → **Environment variables** → **Add a variable** → **Add a single variable**.
   - Key: `DASHBOARD_PASSWORD`
   - Value: the shared password you will give your father
   - If you see **Contains secret values**, turn it on
   - Use the same value for every deploy context (Production, Deploy Previews, and Branch deploys) so every copy of the site stays locked
   - If you see scopes, include **Functions** (or leave **All**). Do not limit the variable to Builds only, or the live site cannot read it
7. Click **Deploy site**.
8. If you add or change the password after the first deploy, open **Deploys** → **Trigger deploy** → **Deploy site**. Netlify applies environment variables when it deploys.
9. Open the site URL Netlify shows (it ends in `.netlify.app`). You should see the password form, not the stock list. Enter the password, then send your father that URL and the same password. Closing the browser signs him out.

Do not put the password in `netlify.toml` or in a commit.

## Watchlist

The starting list is SPY, QQQ, AAPL, MSFT, NVDA, AMZN, META, and TSLA in [`src/config/watchlist.ts`](src/config/watchlist.ts). Change that file, or add and remove tickers in the header. Those edits are saved in this browser’s local storage, so they stay after a refresh and after you sign in again. **Reset list** restores the default names. The list is not stored in the login cookie.

Above the table, **Full list** shows every symbol. **Above the range**, **Below the range**, and **Inside** filter the list.

Below the table, oil (CL=F) and the 10-year Treasury (^TNX) show the latest Yahoo level and the move over the last three trading sessions.

## Data

Quotes come from Yahoo Finance’s public chart endpoint (no API key). The feed is unofficial. Quotes can be delayed, and nothing here is a brokerage price. The last price includes premarket and after-hours when Yahoo sends them. The opening range does not.

### Plug in another feed

`BarsProvider` in [`src/lib/types.ts`](src/lib/types.ts) is the adapter. A provider returns 1-minute bars (`t` as unix milliseconds, plus high, low, and close) and the latest price. The opening-range rules in [`src/lib/session.ts`](src/lib/session.ts) stay the same.

The current adapter is [`server/yahoo.ts`](server/yahoo.ts). To switch feeds, implement `BarsProvider` and use it in place of `yahooProvider` in [`server/app.ts`](server/app.ts). The browser only talks to `GET /api/opening-range?symbols=SPY,QQQ`.

## How the range is chosen

- The opening range is the high and low of regular-session 1-minute bars from 9:30:00 through 9:44:59 ET. The 9:45 bar is not included.
- Before 9:45am ET on a trading day, the range is still forming and breakouts are not signaled.
- Before 9:30am, after the close (4:00pm ET, or 1:00pm on the early closes listed in code), and on weekends and holidays, the dashboard keeps the latest completed session’s opening range and says the session is closed. The last price can still be the premarket or after-hours print.
- A price equal to the high or the low is still inside. Above means strictly above the high. Below means strictly below the low.

## Limits

- Yahoo Finance can rate-limit, change, or drop this unofficial endpoint. There is no API key and no service-level agreement.
- Prices may be delayed. Do not treat them as a live brokerage quote.
- The UI refreshes about every 20 seconds. Each symbol is cached on the server for 15 seconds.
- The holiday and early-close list covers 2025–2027 only. Later years skip weekends but do not know holidays.
- One-minute bars are stamped at the start of the minute. A missing minute is omitted, and the row says when fewer than 15 opening minutes came back.
- This is a scanner, not advice to buy or sell.
- The shared password is the only lock. Pick something long enough to share privately, and rotate it by changing `DASHBOARD_PASSWORD` and redeploying. After eight wrong tries from the same address, the form pauses for about ten minutes. On Netlify that pause is per running instance, so a new instance can reset it sooner.
- On Netlify the app runs as a serverless function. A slow quote request can hit the function time limit, which is about 10 seconds.
