# Mini CRM Multi-tenant
Mini CRM colaborativo multi-tenant construido con Next.js, Supabase y TypeScript. Permite que múltiples empresas usen la misma plataforma de forma aislada — cada organización solo ve sus propios contactos y equipo.

## Link de la app
🔗 https://mini-crm-mu-eight.vercel.app

### Cuentas de prueba
**Organización 1 — AC Enterprise**
- Email: `alexicampines@gmail.com`
- Contraseña: (Solicitarlas)
- Rol: Owner

**Organización 2**
- Email: `(campinesperez01@gmail.com)`
- Contraseña: Solicitarlas)
- Rol: Owner

## Funcionalidades
- ✅ Registro y login con Supabase Auth
- ✅ Creación automática de organización al registrarse (owner)
- ✅ Invitación de miembros por email con link único (expira en 7 días, un solo uso)
- ✅ Tres roles: owner, admin, member
- ✅ CRUD de contactos (nombre, email, teléfono, empresa, notas, etiquetas)
- ✅ Búsqueda por nombre, email y empresa
- ✅ Filtro por etiqueta
- ✅ Eliminación lógica (soft delete) — solo owner y admin pueden eliminar
- ✅ Vista de equipo con miembros y roles
- ✅ Dashboard con total de contactos, nuevos esta semana y últimas 10 actividades
- ✅ Multi-tenant — cada organización solo ve sus propios datos

## Stack Sugerido
- Frontend: Next.js 16 (App Router) + TypeScript
- Backend: Supabase (Auth, PostgreSQL, Edge Functions)
- UI: Tailwind CSS + shadcn/ui
- Deploy: Vercel (frontend) + Supabase Cloud (backend)

## Cómo correrlo localmente
Necesitas tener Node.js instalado y una cuenta en Supabase.

**1. Clona el proyecto**

- bash
git clone https://github.com/alexicampines-dotcom/mini-crm.git
cd mini-crm
```

**2. Instala las dependencias**

- bash
npm install
```

**3. Configura las variables de entorno**

Crea un archivo `.env.local` en la raíz del proyecto:

- bash
cp .env.example .env.local

Luego abre `.env.local` y pon tus credenciales de Supabase (las encuentras en Settings → API de tu proyecto).

**4. Configura la base de datos**

En tu proyecto de Supabase ve a SQL Editor y ejecuta el archivo `schema.sql` que está en este repositorio.

**5. Corre el servidor**

```bash
npm run dev
```

Abre http://localhost:3000 y listo.

## Variables de entorno
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

## Decisiones de arquitectura
**RLS en la base de datos en vez de filtrar desde el backend**
La seguridad multi-tenant se implementa a nivel de base de datos usando Row Level Security (RLS). La razón es simple: si filtras desde el backend siempre existe el riesgo de que alguien se olvide de agregar el filtro en algún endpoint. Con RLS eso no puede pasar porque la base de datos lo aplica sola en cada consulta.

**Soft delete en vez de borrar los contactos**
Cuando alguien "elimina" un contacto, en realidad solo se le pone una fecha en el campo `deleted_at`. Así el registro de actividades sigue siendo coherente y técnicamente se podría recuperar si hace falta.

**Triggers para el log de actividades**
Las actividades se registran automáticamente en la base de datos cada vez que se crea, edita o elimina un contacto. De esta forma no dependo del frontend para registrar nada — si alguien hace una acción, siempre queda guardada.

**Funciones con SECURITY DEFINER para las operaciones sensibles**
Cosas como aceptar invitaciones, cambiar roles o eliminar contactos se manejan con funciones SQL que corren con permisos elevados pero con lógica controlada. Así el cliente nunca tiene acceso directo a hacer esas operaciones.

**Tags como array de texto**
Las etiquetas se guardan directamente en la tabla de contactos como `TEXT[]` con un índice GIN. No necesité una tabla separada y las búsquedas por etiqueta son rápidas.

## Limitaciones conocidas

**Rate limit de emails en desarrollo**
El plan gratuito de Supabase limita el envío de emails a 2 por hora. Esto afecta el registro de nuevos usuarios y el flujo de invitaciones durante las pruebas. En un entorno de producción real se configuraría un proveedor SMTP externo como Resend o SendGrid desde Supabase → Settings → Auth → SMTP Settings.

El flujo de invitación está completamente implementado — el link se genera correctamente, expira en 7 días y es de un solo uso. La limitación es exclusiva del plan gratuito para desarrollo.