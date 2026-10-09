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
- [ ] Al ponerte de frente arranca la **prueba de vida**: girar a la DERECHA, luego a la IZQUIERDA y luego mirar al CENTRO. No pide parpadear.
- [ ] **IMPORTANTE:** al girar la cabeza hacia TU izquierda, el punto azul del indicador se mueve hacia la IZQUIERDA de la pantalla. Si se mueve al revés, avísame (es un ajuste de una línea).
- [ ] Al completar → “¡Hola, {nombre}! ¿Vas a…?” con 4 botones: Entrar, Salir a almuerzo, Regresar de almuerzo, Salir (el sugerido resaltado).
- [ ] Al pulsarlo → pantalla verde con la hora oficial (hh:mm:ss) y “¡Llegaste a tiempo!” o “Atraso: X min”.
- [ ] Vuelve sola a la pantalla de espera a los 6 s.
- [ ] Volver a marcar enseguida → “Acabas de marcar. Espera N segundos”.
- [ ] Tras 60 s: lo ya marcado aparece con ✓ y su hora; lo anterior queda “Ya no disponible hoy”. Se puede saltar un paso (p. ej. Salir sin marcar almuerzo) pero no repetir ni retroceder.
- [ ] “← Volver al inicio” (abajo) lleva a la pantalla para elegir Kiosco o Dashboard.
- [ ] **Salida olvidada**: si ayer (o su último día trabajado) marcó Entrar pero no Salir, al reconocerlo sale 5 s la pantalla roja “AYER OLVIDASTE MARCAR TU SALIDA” y luego las opciones. Si ya marcó algo hoy, o ayer sí marcó Salir, no sale. Después del aviso la cuenta regresiva es de **35 s**, y aunque se haya echado para atrás a leer el aviso, las opciones no se cancelan solas al aparecer.
- [ ] Tras “¡Hola, …!” se ve la cuenta regresiva de 15 s (roja en los últimos 5). Si no se elige nada, vuelve a la espera con “Se acabó el tiempo para elegir…” y hay que escanearse de nuevo.
- [ ] **Permiso → Todo el día**: pantalla verde “Permiso registrado · Todo el día”; en el dashboard el día sale en celeste “Permiso (todo el día)”.
- [ ] **Permiso → Por horas**: elegir horas y hora de inicio; muestra “de 08:00 a 10:00”. Si cubre la hora de entrada, al marcar Entrar no cuenta atraso hasta el fin del permiso.
- [ ] Un segundo permiso el mismo día → “Ya registraste un permiso hoy…”.
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
- [ ] **Observaciones**: en una fila, el botón **+** junto a la fecha abre “📝 Observación” (no abre las fotos). Guardar → la fila muestra 📝 y el texto bajo la fecha. Volver a abrir → editar o **Borrar**. Sale en “Solo novedades”, en el detalle del día y en la columna **Observaciones** del Excel.
- [ ] Al entrar se ve **solo hoy** (“Hoy, lun …”). “Ver rápido: Ayer / Últimos 7 días / Últimos 30 días” cambian el rango y conservan sucursal y empleado.
- [ ] **Horario por empleado**: en Empleados → Editar, desmarca “Dom” y guarda → ese empleado ya no aparece los domingos. Un empleado solo con “Dom” aparece solo los domingos.
- [ ] Quita “Entra a la misma hora todos los días” → aparece una hora por cada día elegido; pon el sábado más tarde y verifica que el atraso del sábado usa esa hora. La lista de Empleados muestra “Lun–Vie 07:00 · Sáb 08:00”.
- [ ] Si alguien marca en su día libre, la fila sale con Horario “Libre” y sin atraso; el kiosco dice “Hoy es tu día libre”.
- [ ] La tabla muestra entrada, salida/regreso de almuerzo, salida final, duración, exceso, atraso y horas trabajadas.
- [ ] Para provocar **atraso**: pon el horario del empleado 30 min antes de la hora actual y marca entrada → fila **roja** con “+23 min”.
- [ ] Para provocar **exceso de almuerzo**: en Configuración pon “Almuerzo permitido” = 10 min, marca salida a almuerzo, espera 12 min y marca regreso → fila roja y alerta registrada.
- [ ] Días con marcaciones faltantes → fila **amarilla** “Incompleto”.
- [ ] Filtros por fecha, sucursal, empleado y “Solo novedades” funcionan.
- [ ] Tocar una fila → ventana “¿Qué fotos quieres ver?” con Todas / Entrada / Salida almuerzo / Regreso / Salida (y Permiso). Se ve la foto completa con el fondo, la cara en pequeño, la hora y si la IP es de la sucursal (✓) o no registrada (⚠ posible marcación fuera del local).
- [ ] Ficha del empleado → muestra su última foto tomada por el kiosco.
- [ ] Excel: columna “Permiso” y filas celestes para permisos de todo el día.
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
- [ ] **Eliminar empleado** (Empleados → Editar → abajo de todo, escribir ELIMINAR) → vuelve a la lista con “Empleado eliminado”; ya no aparece en Empleados, Asistencia ni en el Excel, y sus fotos se borran del bucket.
