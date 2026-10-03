import "server-only";
import type { NotificationChannel, NotificationMessage } from "./types";

/** Canal Telegram Bot (sendMessage). Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID. */
export class TelegramChannel implements NotificationChannel {
  readonly name = "telegram";

  constructor(
    private readonly token: string,
    private readonly chatId: string,
  ) {}

  isConfigured(): boolean {
    return /^\d+:[A-Za-z0-9_-]{30,}$/.test(this.token) && this.chatId.trim().length > 0;
  }

  async send(message: NotificationMessage): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message.text.slice(0, 4000),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
    } catch {
      // No propagar el error original: su mensaje podría incluir la URL con el token.
      throw new Error("Telegram: sin conexión o tiempo agotado");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { description?: string };
      throw new Error(`Telegram HTTP ${res.status}${body.description ? `: ${body.description.slice(0, 120)}` : ""}`);
    }
  }
}
