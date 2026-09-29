from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from app.email.emailer import EmailService
from app.config.config import Config


@pytest.fixture
def smtp(monkeypatch):
    monkeypatch.setattr(Config, 'EMAIL_MODE', 'smtp')
    monkeypatch.setattr(Config, 'SMTP_USE_SSL', False)
    monkeypatch.setattr(Config, 'SMTP_USE_TLS', True)
    monkeypatch.setattr(Config, 'SMTP_USERNAME', 'sender@example.com')
    monkeypatch.setattr(Config, 'EMAIL_MAX_RETRIES', 1)
    monkeypatch.setattr(Config, 'EMAIL_RETRY_DELAY', 0)
    factory = MagicMock(side_effect=lambda *a, **kw: MagicMock())
    monkeypatch.setattr('app.email.emailer.smtplib.SMTP', factory)
    monkeypatch.setattr(EmailService, '_log', MagicMock())
    yield factory
    EmailService._close_smtp()


def send():
    return EmailService.send('candidate@example.com', 'Invite', '<p>Invite</p>', background=False)


def test_bulk_reuses_authenticated_connection(smtp):
    with EmailService.smtp_batch():
        assert send() is True
        server = EmailService._smtp_local.server
        assert send() is True
        assert server.sendmail.call_count == 2
        server.login.assert_called_once()
        server.starttls.assert_called_once()
    assert smtp.call_count == 1
    server.quit.assert_called_once()


def test_failed_connection_is_replaced_on_retry(smtp):
    broken, working = MagicMock(), MagicMock()
    broken.sendmail.side_effect = OSError('Disconnected')
    smtp.side_effect = [broken, working]
    with EmailService.smtp_batch():
        assert send() is True
    assert smtp.call_count == 2
    working.sendmail.assert_called_once()


def test_quit_failure_does_not_duplicate_delivered_email(smtp):
    server = MagicMock()
    server.quit.side_effect = OSError('Disconnected after acceptance')
    smtp.side_effect = [server]
    assert send() is True
    server.sendmail.assert_called_once()
    server.close.assert_called_once()


def test_connections_are_isolated_between_workers(smtp):
    import threading
    barrier = threading.Barrier(2)
    def worker():
        with EmailService.smtp_batch():
            assert send() is True
            server = EmailService._smtp_local.server
            barrier.wait(timeout=5)
            assert send() is True
            return server
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker) for _ in range(2)]
        servers = [f.result() for f in futures]
    assert servers[0] is not servers[1]
    assert smtp.call_count == 2
    for server in servers:
        assert server.sendmail.call_count == 2
        server.quit.assert_called_once()


def test_batch_records_each_result_even_when_worker_cleanup_raises(monkeypatch):
    import json
    from types import SimpleNamespace
    from app.routes import bulk_email_routes as routes
    batch = SimpleNamespace(subject='Invite', personalize=True, company_id=1, admin_id=1)
    query = MagicMock()
    query.get.return_value = batch
    monkeypatch.setattr(routes, 'BulkEmailBatch', SimpleNamespace(query=query))
    monkeypatch.setattr(routes, 'db', SimpleNamespace(session=MagicMock()))
    monkeypatch.setattr(routes, 'SEND_CONCURRENCY', 2)
    def invite(row, *args):
        if row['email'] == 'failed@example.com':
            raise RuntimeError('cleanup failed')
        return None
    monkeypatch.setattr(routes, '_invite_one', invite)
    routes._process_batch(1, [{'email': 'ok@example.com'}, {'email': 'failed@example.com'}])
    assert batch.status == 'complete'
    assert batch.sent_count == 1
    assert batch.failed_count == 1
    assert json.loads(batch.failures)[0]['row'] == 2


def test_blocked_starttls_port_falls_back_and_reuses_ssl(smtp, monkeypatch):
    smtp.side_effect = OSError(101, 'Network is unreachable')
    ssl_factory = MagicMock()
    monkeypatch.setattr('app.email.emailer.smtplib.SMTP_SSL', ssl_factory)
    with EmailService.smtp_batch():
        assert send() is True
        assert send() is True
    assert smtp.call_count == 1
    assert ssl_factory.call_args.args == (Config.SMTP_HOST, 465)
    assert ssl_factory.return_value.sendmail.call_count == 2
    ssl_factory.return_value.login.assert_called_once()
    ssl_factory.return_value.starttls.assert_not_called()


def test_authentication_failure_does_not_trigger_ssl_fallback(smtp, monkeypatch):
    import smtplib
    server = MagicMock()
    server.login.side_effect = smtplib.SMTPAuthenticationError(535, b'Invalid credentials')
    smtp.side_effect = lambda *args, **kwargs: server
    ssl_factory = MagicMock()
    monkeypatch.setattr('app.email.emailer.smtplib.SMTP_SSL', ssl_factory)
    assert send() is False
    ssl_factory.assert_not_called()
    server.sendmail.assert_not_called()
    assert server.close.call_count == 2


def test_send_timeout_does_not_trigger_ssl_fallback(smtp, monkeypatch):
    server = MagicMock()
    server.sendmail.side_effect = TimeoutError('DATA response timeout')
    smtp.side_effect = lambda *args, **kwargs: server
    ssl_factory = MagicMock()
    monkeypatch.setattr('app.email.emailer.smtplib.SMTP_SSL', ssl_factory)
    assert send() is False
    ssl_factory.assert_not_called()
