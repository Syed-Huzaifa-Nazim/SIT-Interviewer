"""One-time setup: mint a Gmail API refresh token for EMAIL_MODE=gmail_api.

Why this exists: Render's free tier (and many other hosts) blocks outbound SMTP, so the app
can no longer email candidates via smtplib in production. Every transactional-email API
(Resend, SendGrid, etc.) requires a DNS-verified domain you own to send to arbitrary
recipients — not viable without buying one. This script instead authorizes the app to send
as your EXISTING Gmail account (EMAIL_FROM) over Gmail's HTTPS API, which Render does not
block and which can send to anyone, exactly like a normal Gmail send.

Prerequisites (one-time, in Google Cloud Console — https://console.cloud.google.com/):
  1. Create a project (or reuse one).
  2. APIs & Services -> Library -> enable "Gmail API".
  3. APIs & Services -> OAuth consent screen:
       - User type: External.
       - Scopes: add https://www.googleapis.com/auth/gmail.send
       - Test users: add the Gmail address you're sending FROM (e.g. EMAIL_FROM).
       - Click "PUBLISH APP" (moves it out of "Testing"). This is required — refresh
         tokens minted while the app is in "Testing" status expire after just 7 days.
         Publishing does NOT require Google's review process for personal/low-volume use;
         you'll just see an "unverified app" warning during the consent step below, which
         is expected and safe to click through since it's your own app and your own Gmail.
  4. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
       -> Application type: Desktop app. Copy the Client ID and Client Secret.

Run this from the backend/ folder:  python scripts/gmail_oauth_setup.py
It opens your browser for a one-time Google login/consent, then prints the refresh token —
paste that plus the Client ID/Secret into backend/.env (and later Render's dashboard) as
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and set EMAIL_MODE=gmail_api.
"""
import sys
import webbrowser
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

REDIRECT_PORT = 8765
REDIRECT_URI = f'http://localhost:{REDIRECT_PORT}'
SCOPE = 'https://www.googleapis.com/auth/gmail.send'

_captured_code = {}


class _RedirectHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if 'code' in params:
            _captured_code['code'] = params['code'][0]
            body = b"<html><body>Authorized. You can close this tab and return to the terminal.</body></html>"
        else:
            body = b"<html><body>No authorization code received. Close this tab and check the terminal.</body></html>"
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # keep the console output clean


def main():
    client_id = input("Google OAuth Client ID: ").strip()
    client_secret = input("Google OAuth Client Secret: ").strip()
    if not client_id or not client_secret:
        sys.exit("Both Client ID and Client Secret are required.")

    auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
        'client_id': client_id,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': SCOPE,
        'access_type': 'offline',   # required to get a refresh_token back
        'prompt': 'consent',        # forces a refresh_token even on a repeat run
    })

    print(f"\nOpening your browser to authorize... if it doesn't open, visit:\n{auth_url}\n")
    webbrowser.open(auth_url)

    server = HTTPServer(('localhost', REDIRECT_PORT), _RedirectHandler)
    print(f"Waiting for the redirect on {REDIRECT_URI} ...")
    while 'code' not in _captured_code:
        server.handle_request()

    code = _captured_code['code']
    print("Authorization code received. Exchanging it for a refresh token...")

    token_resp = requests.post('https://oauth2.googleapis.com/token', data={
        'client_id': client_id,
        'client_secret': client_secret,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': REDIRECT_URI,
    }, timeout=20)

    if token_resp.status_code != 200:
        sys.exit(f"Token exchange failed ({token_resp.status_code}): {token_resp.text}")

    tokens = token_resp.json()
    refresh_token = tokens.get('refresh_token')
    if not refresh_token:
        sys.exit(
            "No refresh_token in the response — Google only returns one on the FIRST "
            "consent for a given app+account, or when prompt=consent forces re-consent "
            "(already set here). If you've run this before, revoke the app's access at "
            "https://myaccount.google.com/permissions and try again."
        )

    print("\nSuccess! Add these to backend/.env (and later Render's dashboard):\n")
    print(f"GOOGLE_CLIENT_ID={client_id}")
    print(f"GOOGLE_CLIENT_SECRET={client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN={refresh_token}")
    print("EMAIL_MODE=gmail_api")


if __name__ == '__main__':
    main()
