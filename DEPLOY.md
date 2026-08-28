# Despliegue en la PC del secretario (Windows, LAN WiFi)

El sistema corre en **una sola PC** de la oficina y el resto del equipo accede por
el navegador a través de la red WiFi. Un solo proceso Node sirve la app web,
el tiempo real (Socket.IO) y el editor colaborativo (Hocuspocus).

> Referencia: PLAN.md §14.

---

## 1. Requisitos

- **Node.js 22 LTS** (obligatorio). El AI SDK de Vercel (Sección 3/6) requiere
  Node ≥ 22. Descargar de nodejs.org.
- **npm** (viene con Node).
- La PC debe quedar **encendida** siempre que la oficina use el sistema.

## 2. Instalación

```bash
git clone <repo>  bufete
cd bufete
npm install
cp .env.example .env
```

Editar `.env`:

| Variable | Valor |
|---|---|
| `BETTER_AUTH_SECRET` | generar con `openssl rand -base64 32` (o `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `BETTER_AUTH_URL` | `http://<IP-LAN-FIJA>:3000` (ver paso 4), p. ej. `http://192.168.1.50:3000` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (solo si se usará la Sección 6 / correos) |
| `AI_GATEWAY_API_KEY` | clave del AI Gateway de Vercel (Secciones 3 y 6) |
| `PORT` | `3000` |

## 3. Build y primer usuario

```bash
npm run build
npm run seed        # aplica migraciones y pide correo/contraseña del admin
```

El seed crea el usuario **admin**. Con esa cuenta se crea el resto del equipo
desde **Administración → Usuarios** (el registro público está deshabilitado).

## 4. IP fija

En el router, reservar por DHCP la IP de esta PC (o configurar IP estática),
por ejemplo `192.168.1.50`. Actualizar `BETTER_AUTH_URL` en `.env` con esa IP.

## 5. Firewall de Windows

Crear una regla de entrada que permita **TCP 3000** solo para el perfil
**Red privada**:

```powershell
New-NetFirewallRule -DisplayName "Bufete 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow
```

## 6. Arranque automático con PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
npx pm2-windows-startup install
```

Esto deja el servidor corriendo, lo reinicia si se cae y lo levanta al
encender la PC. Comandos útiles: `pm2 logs bufete`, `pm2 restart bufete`,
`pm2 status`.

## 7. Plan de energía

Panel de control → Opciones de energía → nunca suspender el equipo
(solo apagar la pantalla).

## 8. Acceso del equipo

Cada persona abre `http://192.168.1.50:3000` en su navegador. Crear un acceso
directo en cada escritorio.

## 9. Backups

- Automático: cada noche a las **02:00** (hora de Guayaquil) el sistema hace
  `VACUUM INTO data/backups/bufete-YYYY-MM-DD.db` y conserva los últimos 30,
  además de espejar `storage/`.
- Verificar `data/backups/` después de la primera noche.
- **Recomendado**: copiar semanalmente `data/backups/` a un USB o a OneDrive.

## 10. Advertencias

- Si esta PC se apaga, el sistema no está disponible para nadie.
- Los documentos abiertos en el editor **no se pierden** con un corte de WiFi o
  de luz: quedan en el navegador (`y-indexeddb`) y se re-sincronizan al volver.
- **Nunca** borrar `data/bufete.db` con el servidor corriendo. Para restaurar un
  backup: `pm2 stop bufete`, reemplazar el archivo, `pm2 start bufete`.
- No exponer el puerto 3000 a internet. El sistema está pensado solo para la LAN.

---

## Logs

`logs/app-YYYY-MM-DD.N.log` (rotación diaria, 30 días). Con PM2: `pm2 logs bufete`.
En producción el logger escribe solo al archivo (no a la consola).

## Avisos conocidos (inofensivos)

- `Yjs was already imported...` al arrancar: lo emite el ecosistema Hocuspocus/
  Tiptap por la doble carga ESM/CJS de `yjs`. Con una sola versión de `yjs`
  instalada (el caso) el editor funciona con normalidad (persistencia y
  reconexión verificadas).
- Warning de `jose`/`CompressionStream` en el build: código de better-auth
  trazado para el edge middleware que nunca se ejecuta (el middleware solo lee
  la cookie).

## Actualizar el sistema

```bash
git pull
npm install
npm run build
pm2 restart bufete
```

Las migraciones de base de datos se aplican solas al arrancar; los feriados y
las reglas de plazo por defecto también se siembran solos.

---

## Sección 3/6 — Asistente IA (opcional pero recomendado)

1. Crear una cuenta en Vercel y activar el **AI Gateway**.
2. Generar una API key del Gateway y ponerla en `.env` como `AI_GATEWAY_API_KEY`.
3. En **Administración → Códigos legales**, subir los PDFs (COGEP, Código Civil,
   COIP, CONA, Constitución…). La ingestión corre en segundo plano.

Sin `AI_GATEWAY_API_KEY` el chat responde con un aviso y la ingestión guarda el
texto pero sin embeddings (la búsqueda cae a coincidencia por palabras).

---

## Sección 6 — Resumen de correos (opcional)

Requiere registrar una aplicación en **Microsoft Entra ID**:

1. Portal de Azure → **Microsoft Entra ID → Registros de aplicaciones → Nuevo
   registro**. Nombre: "Bufete – lectura de correo". Tipos de cuenta: el del
   bufete (o multi-inquilino). Sin URI de redirección.
2. En la app registrada → **Autenticación** → habilitar **"Permitir flujos de
   cliente público"** (allowPublicClient = true).
3. **Permisos de API** → Microsoft Graph → **Permisos delegados** →
   `Mail.Read` y `offline_access` → conceder consentimiento del administrador.
4. Copiar el **Id. de aplicación (cliente)** y el **Id. de inquilino** a `.env`:
   `MSGRAPH_CLIENT_ID`, `MSGRAPH_TENANT_ID`.
5. Definir `ENCRYPTION_KEY` en `.env` (`openssl rand -hex 32`).
6. En la app, la abogada abre **Correos → Vincular buzón**, va a
   `microsoft.com/devicelogin`, ingresa el código y autoriza. Se hace una sola vez.

Si el bufete no puede registrar la app, la sección queda en "No configurado" y
**el resto del sistema funciona igual**.
