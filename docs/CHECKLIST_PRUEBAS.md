# Checklist de pruebas manuales (localhost, `DEV_MODE=true`)

Marca cada punto al verificarlo. Usa **Chrome o Edge** en una computadora con cámara.
Las pruebas automáticas se corren con `npm test` (66 pruebas: estados, cálculos, zona horaria, liveness, dispositivos, validaciones y Excel).

## 0. Preparación
- [ ] `npm install` termina sin errores y crea `public/models/` (6 archivos).
- [ ] `.env.local` tiene las 2 llaves de Supabase (`sb_publishable_…`, `sb_secret_…`), `DEV_MODE=true`, `ALERTS_ENABLED=false`.
- [ ] `npm run create-admin` crea tu usuario administrador.
- [ ] `npm run dev` y abre http://localhost:3000.

## 1. Acceso de administrador
- [ ] `/dashboard` sin sesión redirige a `/login`.
- [ ] Contraseña incorrecta → “Correo o contraseña incorrectos.”
- [ ] 11 intentos fallidos seguidos → “Demasiados intentos…”.
- [ ] Login correcto → dashboard con franja ámbar “Modo desarrollo (DEV_MODE=true)”.
- [ ] “Cerrar sesión” vuelve al login.

## 2. Sucursales e IPs
- [ ] Aparecen **Pucará** y **Rumicucho**.
- [ ] “Tu IP pública detectada ahora” muestra tu IP (vía ipify en localhost).
- [ ] “Agregar mi IP actual a esta sucursal” pide confirmación y agrega la IP.
- [ ] IP inválida (`999.1.1.1`) o rango mal escrito (`186.4.12.7/24`) muestran error claro.
- [ ] Eliminar una IP pide confirmación.

## 3. Empleados y consentimiento
- [ ] Crear empleado con cédula inválida → error en el campo.
- [ ] Crear empleado válido → redirige a su ficha con aviso verde.
- [ ] “Imprimir consentimiento” abre la hoja con nombre, cédula y líneas de firma.
- [ ] Sin consentimiento NO aparece el botón “Enrolar rostro”.
- [ ] Registrar consentimiento (2 casillas) → muestra fecha y versión.

## 4. Enrolamiento facial
- [ ] La cámara se abre y el recuadro verde sigue tu cara.
- [ ] Las 5 indicaciones (frente, un lado, el otro lado, cerca, frente) se capturan solas.
- [ ] Con 2 personas en cámara → “Hay más de un rostro…”.
- [ ] Cambiar de persona a mitad del enrolamiento → “Esa muestra no parece de la misma persona”.
- [ ] “Guardar” → “Rostro enrolado con 5 muestras”. La ficha muestra 5 muestras.
- [ ] Enrolar a OTRA persona con tu misma cara → “Este rostro es demasiado parecido al de …”.

## 5. Kiosco (`http://localhost:3000/marcar?sucursal=pucara`)
- [ ] Muestra “Sucursal Pucará”, la etiqueta DEV_MODE y el reloj (hora del servidor).
- [ ] Al ponerte de frente arranca la **prueba de vida**: girar a la derecha y a la izquierda (orden aleatorio) y luego mirar al centro. No pide parpadear.
- [ ] **IMPORTANTE:** al girar la cabeza hacia TU izquierda, el punto azul del indicador se mueve hacia la IZQUIERDA de la pantalla. Si se mueve al revés, avísame (es un ajuste de una línea).
- [ ] Al completar → “Hola, {nombre}” y un botón grande “Registrar entrada”.
- [ ] Al pulsarlo → pantalla verde con la hora oficial (hh:mm:ss) y “¡Llegaste a tiempo!” o “Atraso: X min”.
- [ ] Vuelve sola a la pantalla de espera a los 6 s.
- [ ] Volver a marcar enseguida → “Acabas de marcar. Espera N segundos”.
- [ ] Tras 60 s: aparece “Registrar salida a almuerzo” (solo el siguiente evento válido).
- [ ] Completar las 4 marcaciones → la siguiente vez: “Ya registraste todas tus marcaciones de hoy”.
- [ ] Identificado y pulsar “No soy … · cancelar” → vuelve a la espera sin marcar.
- [ ] Irte de la cámara estando identificado → a los 5 s se cancela solo.

## 6. Anti-fraude
- [ ] **Foto impresa o en el celular** frente a la cámara → falla la prueba de vida (o “No te reconocimos”).
- [ ] Persona no enrolada → “No te reconocimos…”.
- [ ] Dos personas durante la prueba → “Se detectó más de un rostro…”.
- [ ] No completar los movimientos en 20 s → “Tiempo agotado”.
- [ ] Abrir `/marcar` con DevTools → modo dispositivo (iPhone/Android) y recargar → “Dispositivo no permitido”.
- [ ] **Restricción por IP:** pon `DEV_MODE=false`, reinicia `npm run dev`, quita tu IP de la sucursal y abre `/marcar` → “Equipo no autorizado” con tu IP. Agrega tu IP desde el dashboard y recarga → funciona. Vuelve a `DEV_MODE=true`.
- [ ] Todos los rechazos aparecen en **Intentos fallidos** con motivo, IP y miniatura (cuando aplica).

## 7. Dashboard de asistencia
- [ ] La tabla muestra entrada, salida/regreso de almuerzo, salida final, duración, exceso, atraso y horas trabajadas.
- [ ] Para provocar **atraso**: pon el horario del empleado 30 min antes de la hora actual y marca entrada → fila **roja** con “+23 min”.
- [ ] Para provocar **exceso de almuerzo**: en Configuración pon “Almuerzo permitido” = 10 min, marca salida a almuerzo, espera 12 min y marca regreso → fila roja y alerta registrada.
- [ ] Días con marcaciones faltantes → fila **amarilla** “Incompleto”.
- [ ] Filtros por fecha, sucursal, empleado y “Solo novedades” funcionan.
- [ ] Clic en el nombre → detalle del día con las 4 miniaturas, IP y distancia facial.
- [ ] **Descargar Excel** respeta los filtros; al abrirlo: encabezado naranja, filas rojas/amarillas, horas con formato hh:mm, hoja “Resumen por empleado”.

## 8. Alertas (con `ALERTS_ENABLED=false`)
- [ ] El exceso de almuerzo aparece en **Alertas** como “Pendiente de envío” y NO llega ningún mensaje.
- [ ] Cron manual (en otra terminal, desde la carpeta del proyecto):
  `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/alertas`
  → con alguien en almuerzo vencido crea “Almuerzo sin regreso”; ejecutarlo de nuevo NO duplica.
- [ ] Sin el header Authorization → 401.

## 9. Configuración y privacidad
- [ ] Cambiar la tolerancia recalcula los atrasos del dashboard.
- [ ] Desactivar “Guardar miniatura” → las nuevas marcaciones no guardan foto.
- [ ] **Eliminar datos biométricos** (escribir ELIMINAR) → el kiosco deja de reconocer a esa persona y la ficha pide un nuevo consentimiento.
