export type LoginPageState = "setup" | "login" | "wrong" | "limited";

export function loginDocument(state: LoginPageState): string {
  const setup = state === "setup";
  const error =
    state === "wrong"
      ? "Wrong password."
      : state === "limited"
        ? "Too many tries. Wait a few minutes."
        : "";

  const body = setup ? setupBody() : loginBody(error);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${setup ? "Set a password" : "Sign in"} · Piper Terminal</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 20px;
        background:
          radial-gradient(900px 420px at 8% -10%, rgba(150, 176, 214, 0.14), transparent 55%),
          #0c0e12;
        color: #f4f7fb;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      main {
        width: min(440px, 100%);
        background: rgba(20, 25, 34, 0.94);
        border: 1px solid rgba(232, 238, 248, 0.1);
        border-radius: 18px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        padding: 28px 24px 24px;
      }
      h1 { margin: 0; font-size: 26px; letter-spacing: -0.03em; }
      p { color: #9aa6b8; line-height: 1.5; }
      .error {
        margin: 0 0 14px;
        color: #ffd0d6;
        background: rgba(255, 139, 152, 0.12);
        border: 1px solid rgba(255, 139, 152, 0.35);
        border-radius: 10px;
        padding: 10px 12px;
      }
      label { display: block; font-size: 13px; margin-bottom: 6px; }
      input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(232, 238, 248, 0.16);
        background: #0c0e12;
        color: #f4f7fb;
        font: inherit;
      }
      button {
        margin-top: 14px;
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #e8eef8;
        color: #14181f;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      code {
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        font-size: 0.92em;
        color: #f4f7fb;
      }
      .note { font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Piper Terminal</h1>
      ${body}
    </main>
  </body>
</html>`;
}

function setupBody(): string {
  return `<p>Set a shared password before using this dashboard. The server has no <code>DASHBOARD_PASSWORD</code>, so the page and the market data stay closed.</p>
      <p>On your computer, stop the server and start it again with the variable set:</p>
      <p><code>DASHBOARD_PASSWORD='choose-a-password' npm run dev</code></p>
      <p class="note">On Netlify: Site configuration → Environment variables → add <code>DASHBOARD_PASSWORD</code> → Deploys → Trigger deploy. Do not commit the password.</p>`;
}

function loginBody(error: string): string {
  const alert = error ? `<p class="error" role="alert">${error}</p>` : "";
  return `<p>Enter the shared password to continue.</p>
      ${alert}
      <form method="post" action="/api/login">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus />
        <button type="submit">Continue</button>
      </form>
      <p class="note">Stays signed in until you close the browser.</p>`;
}
