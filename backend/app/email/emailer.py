"""Reusable email-sending service (§1).

Pure-Python delivery via ``smtplib`` — no paid third-party service. Configuration
lives entirely in environment variables (see ``Config``): set ``EMAIL_MODE=smtp``
plus SMTP credentials for real delivery, or leave the default ``EMAIL_MODE=console``
to print rendered emails to the server log (zero-credential dev/testing, mirroring
the platform's ``AI_MODE=mock`` philosophy).

Every send — success or failure — is recorded in the ``email_logs`` table so the
admin can audit deliveries from the Admin Hub instead of failures vanishing silently.
Transient SMTP errors are retried with a short delay before being marked failed.

Deliverability notes: emails are sent multipart (plain-text + HTML) with the
configured ``EMAIL_FROM`` as the envelope sender. For production, use a From
address on a domain you control and publish SPF/DKIM records for the SMTP host
you relay through (Gmail/It's handled automatically when relaying via Gmail App
Passwords or a corporate SMTP server).
"""
import re
import time
import logging
import smtplib
import ssl
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid

from app.config.config import Config

logger = logging.getLogger('emailer')
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter('[%(name)s] %(levelname)s %(message)s'))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)


def _html_to_text(html):
    """Crude but adequate plain-text alternative for multipart delivery."""
    text = re.sub(r'<br\s*/?>', '\n', html)
    text = re.sub(r'</(p|div|h1|h2|h3|tr)>', '\n', text)
    text = re.sub(r'</t[dh]>', ' ', text)  # keep label/value cells separated
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


class EmailService:
    """Modular sender: routes rendered templates to SMTP (or the console) with
    retries, logging, and a persistent EmailLog audit row per message."""

    @classmethod
    def send(cls, to_email, subject, html, email_type='general', user_id=None, background=True):
        """Send an email. With ``background=True`` (default) delivery happens on a
        daemon thread so API responses are never blocked by SMTP latency."""
        if background:
            threading.Thread(
                target=cls._deliver_and_log,
                args=(to_email, subject, html, email_type, user_id),
                daemon=True
            ).start()
        else:
            cls._deliver_and_log(to_email, subject, html, email_type, user_id)

    # ------------------------------------------------------------------ internals

    @classmethod
    def _deliver_and_log(cls, to_email, subject, html, email_type, user_id):
        attempts = 0
        last_error = None
        max_attempts = 1 + max(0, Config.EMAIL_MAX_RETRIES)

        while attempts < max_attempts:
            attempts += 1
            try:
                cls._deliver(to_email, subject, html)
                cls._log(to_email, subject, email_type, user_id, 'sent', None, attempts)
                logger.info(f"Email '{email_type}' sent to {to_email} (attempt {attempts}).")
                return True
            except Exception as e:
                last_error = str(e)
                logger.warning(
                    f"Email '{email_type}' to {to_email} failed on attempt {attempts}/{max_attempts}: {last_error}"
                )
                if attempts < max_attempts:
                    time.sleep(Config.EMAIL_RETRY_DELAY)

        cls._log(to_email, subject, email_type, user_id, 'failed', last_error, attempts)
        logger.error(f"Email '{email_type}' to {to_email} permanently failed: {last_error}")
        return False

    @classmethod
    def _deliver(cls, to_email, subject, html):
        if Config.EMAIL_MODE != 'smtp':
            # Console mode: render to the server log so the flow is fully testable
            # without SMTP credentials.
            print(
                f"\n===== [EMAIL:console] =====\n"
                f"To:      {to_email}\n"
                f"From:    {Config.EMAIL_FROM_NAME} <{Config.EMAIL_FROM}>\n"
                f"Subject: {subject}\n"
                f"--- text body ---\n{_html_to_text(html)}\n"
                f"===== [/EMAIL] =====\n"
            )
            return

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr((Config.EMAIL_FROM_NAME, Config.EMAIL_FROM))
        msg['To'] = to_email
        msg['Reply-To'] = Config.EMAIL_FROM
        # Spam filters (Gmail's included) treat a missing Date/Message-ID as a strong
        # signal of a spoofed or script-generated message — smtplib does not set
        # these automatically, unlike a real MTA, so they must be added explicitly.
        msg['Date'] = formatdate(localtime=True)
        domain = Config.EMAIL_FROM.split('@')[-1] if '@' in Config.EMAIL_FROM else None
        msg['Message-ID'] = make_msgid(domain=domain)
        msg.attach(MIMEText(_html_to_text(html), 'plain', 'utf-8'))
        msg.attach(MIMEText(html, 'html', 'utf-8'))

        if Config.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(Config.SMTP_HOST, Config.SMTP_PORT,
                                  context=ssl.create_default_context(), timeout=20) as server:
                if Config.SMTP_USERNAME:
                    server.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
                server.sendmail(Config.EMAIL_FROM, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=20) as server:
                server.ehlo()
                if Config.SMTP_USE_TLS:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                if Config.SMTP_USERNAME:
                    server.login(Config.SMTP_USERNAME, Config.SMTP_PASSWORD)
                server.sendmail(Config.EMAIL_FROM, [to_email], msg.as_string())

    @classmethod
    def _log(cls, to_email, subject, email_type, user_id, status, error, attempts):
        """Persist an EmailLog row. Runs on the sender thread, which gets its own
        scoped session — always removed afterwards so no connection leaks."""
        from app.database.db import db
        from app.models import EmailLog
        try:
            db.session.add(EmailLog(
                user_id=user_id,
                to_email=to_email,
                email_type=email_type,
                subject=subject[:200],
                status=status,
                error=error,
                attempts=attempts
            ))
            db.session.commit()
        except Exception as log_err:
            db.session.rollback()
            logger.error(f"Could not persist email log for {to_email}: {log_err}")
        finally:
            db.session.remove()
