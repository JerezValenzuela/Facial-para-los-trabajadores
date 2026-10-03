import "server-only";
import type { NotificationChannel, NotificationMessage } from "./types";

/**
 * Canal SMS vía Twilio. APAGADO por defecto: se activa con SMS_ENABLED=true
 * más TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER y
 * SMS_TO_NUMBERS (lista separada por comas, formato +5939XXXXXXXX).
 */
export class TwilioSmsChannel implements NotificationChannel {
  readonly name = "sms";

  constructor(
    private readonly enabled: boolean,
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly to: string[],
  ) {}

  isConfigured(): boolean {
    return (
      this.enabled &&
      /^AC[a-f0-9]{32}$/i.test(this.accountSid) &&
      this.authToken.length >= 16 &&
      /^\+\d{8,15}$/.test(this.from) &&
      this.to.length > 0 &&
      this.to.every((n) => /^\+\d{8,15}$/.test(n))
    );
  }

  async send(message: NotificationMessage): Promise<void> {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const failures: string[] = [];
    for (const to of this.to) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: this.from, Body: message.text.slice(0, 600) }),
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (!res.ok) failures.push(`${to.slice(0, 6)}… HTTP ${res.status}`);
      } catch {
        failures.push(`${to.slice(0, 6)}… sin conexión`);
      }
    }
    if (failures.length === this.to.length) throw new Error(`SMS: ${failures.join("; ")}`);
  }
}
