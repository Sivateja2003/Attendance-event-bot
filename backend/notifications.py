import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_registration_email(
    to_email: str,
    name: str,
    event_name: str,
    display_url: str,
    email_user: str = None,
    email_password: str = None,
    email_from: str = None,
):
    host = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    port = int(os.getenv("EMAIL_PORT", "587"))
    user = email_user or os.getenv("EMAIL_USER")
    password = email_password or os.getenv("EMAIL_PASSWORD")
    from_addr = email_from or os.getenv("EMAIL_FROM") or user

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
        f"See you there!\nAttend"
    )
    html = f"""<html><body style="font-family:sans-serif;color:#1a1a2e;padding:24px">
  <h2 style="color:#6c63ff">You're registered!</h2>
  <p>Hi <strong>{name}</strong>,</p>
  <p>You've been successfully registered for <strong>{event_name}</strong>.</p>
  <p>Watch the live display screen here:</p>
  <p><a href="{display_url}" style="color:#6c63ff">{display_url}</a></p>
  <p>See you there!<br><strong>Attend</strong></p>
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


