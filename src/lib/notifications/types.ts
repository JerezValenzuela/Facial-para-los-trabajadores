/** Mensaje a notificar (texto plano, sin datos biométricos). */
export type NotificationMessage = {
  text: string;
};

/**
 * Canal de notificación desacoplado. Para agregar WhatsApp, correo, etc.,
 * basta con implementar esta interfaz y registrarlo en notifications/index.ts.
 */
export interface NotificationChannel {
  readonly name: string;
  /** true si tiene las credenciales necesarias y está habilitado. */
  isConfigured(): boolean;
  /** Lanza un Error (sin secretos en el mensaje) si el envío falla. */
  send(message: NotificationMessage): Promise<void>;
}
