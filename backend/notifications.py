import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _email_cfg():
    return (
        os.getenv("EMAIL_HOST"),
        int(os.getenv("EMAIL_PORT", "587")),
        os.getenv("EMAIL_USER"),
        os.getenv("EMAIL_PASSWORD"),
        os.getenv("EMAIL_FROM") or os.getenv("EMAIL_USER"),
    )


def send_registration_email(to_email: str, name: str, event_name: str, display_url: str):
    host, port, user, password, from_addr = _email_cfg()
    if not all([host, user, password, to_email]):
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"You're registered for {event_name}!"
    msg["From"] = from_addr
    msg["To"] = to_email

    text = (
        f"Hi {name},\n\n"
        f"You've been successfully registered for {event_name}.\n\n"
        f"Watch the live display screen here:\n{display_url}\n\n"
        f"See you there!\nFaceAttend"
    )
    html = f"""<html><body style="font-family:sans-serif;color:#1a1a2e;padding:24px">
  <h2 style="color:#6c63ff">You're registered!</h2>
  <p>Hi <strong>{name}</strong>,</p>
  <p>You've been successfully registered for <strong>{event_name}</strong>.</p>
  <p>Watch the live display screen here:</p>
  <p><a href="{display_url}" style="color:#6c63ff">{display_url}</a></p>
  <p>See you there!<br><strong>FaceAttend</strong></p>
</body></html>"""

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(host, port) as server:
            server.ehlo()
            server.starttls()
            server.login(user, password)
            server.sendmail(from_addr, to_email, msg.as_string())
        print(f"[email] Sent registration email to {to_email}")
    except Exception as e:
        print(f"[email] Failed to send to {to_email}: {e}")


