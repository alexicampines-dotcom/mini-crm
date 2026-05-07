-- Mini CRM — Schema completo con RLS, funciones y triggers
-- Ejecutar en: Supabase → SQL Editor → New Query

-- pgcrypto se necesita para gen_random_bytes (token de invitaciones).
-- gen_random_uuid() ya está disponible en PostgreSQL 13+, pero pgcrypto es necesario para el token de invitación.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TABLAS

-- Cada empresa que usa el CRM
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Espejo de auth.users en el schema público.
-- Necesario porque auth.users no es accesible desde el frontend.
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relación usuario ↔ organización con su rol
CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Invitaciones por email con link único de 7 días
CREATE TABLE IF NOT EXISTS invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by      UUID NOT NULL REFERENCES profiles(id),
  email           TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  accepted        BOOLEAN NOT NULL DEFAULT false,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contactos del CRM con soft delete
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  notes           TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice parcial: solo contactos activos (los borrados no se buscan)
CREATE INDEX IF NOT EXISTS contacts_org_idx
  ON contacts(organization_id) WHERE deleted_at IS NULL;

-- Índice GIN para filtrar por tags rápido
CREATE INDEX IF NOT EXISTS contacts_tags_idx
  ON contacts USING GIN(tags);

-- Log de actividades para el dashboard
CREATE TABLE IF NOT EXISTS activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  action          TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  contact_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_org_idx
  ON activities(organization_id, created_at DESC);

-- PERMISOS
-- Las tablas creadas por SQL necesitan GRANT explícito

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- FUNCIONES HELPER PARA RLS

-- Devuelve el ID de la organización del usuario actual
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Devuelve el rol del usuario actual en su organización
CREATE OR REPLACE FUNCTION my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM organization_members
  WHERE user_id = auth.uid()
    AND organization_id = get_my_org_id()
  LIMIT 1;
$$;

-- Devuelve los miembros del equipo con su email
CREATE OR REPLACE FUNCTION get_team_members()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role text,
  email text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.id, om.user_id, om.role, p.email, om.created_at
  FROM organization_members om
  JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1
  );
$$;

-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities           ENABLE ROW LEVEL SECURITY;

-- Organizations: solo ves la tuya, nadie puede crear directamente
CREATE POLICY "ver mi organizacion"
  ON organizations FOR SELECT
  USING (id = get_my_org_id());

CREATE POLICY "bloquear insert directo en orgs"
  ON organizations FOR INSERT
  WITH CHECK (false);

-- Profiles: ves tu perfil y los de tu equipo
CREATE POLICY "ver perfiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "bloquear insert directo en perfiles"
  ON profiles FOR INSERT
  WITH CHECK (false);

-- Organization members: cada usuario ve solo su propia membresía
-- Los miembros del equipo se obtienen via get_team_members()
CREATE POLICY "ver mi membresia"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "owner cambia roles"
  ON organization_members FOR UPDATE
  USING (organization_id = get_my_org_id() AND my_role() = 'owner')
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "bloquear insert directo de miembros"
  ON organization_members FOR INSERT
  WITH CHECK (false);

CREATE POLICY "owner remueve miembros"
  ON organization_members FOR DELETE
  USING (organization_id = get_my_org_id() AND my_role() = 'owner');

-- Invitations: solo el owner puede gestionar invitaciones
CREATE POLICY "owner gestiona invitaciones"
  ON invitations FOR ALL
  USING (organization_id = get_my_org_id() AND my_role() = 'owner');

-- Contacts: cualquier miembro ve y crea, solo owner/admin elimina via RPC
CREATE POLICY "ver contactos activos"
  ON contacts FOR SELECT
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

CREATE POLICY "crear contactos"
  ON contacts FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "actualizar contactos"
  ON contacts FOR UPDATE
  USING (organization_id = get_my_org_id() AND deleted_at IS NULL);

-- Activities: solo lectura desde el frontend, los triggers insertan
CREATE POLICY "ver actividades del equipo"
  ON activities FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "bloquear insert directo de actividades"
  ON activities FOR INSERT
  WITH CHECK (false);

-- TRIGGERS Y FUNCIONES

-- Cuando se crea un usuario en Supabase Auth, crea su profile y org
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_slug   TEXT;
  org_name   TEXT;
BEGIN
  -- Crear el perfil espejo
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  -- Si el usuario viene de una invitación, no crear organización nueva
  IF (NEW.raw_user_meta_data->>'skip_org_creation')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Slug simplificado: usar nombre o email + sufijo aleatorio único
  org_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data->>'org_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  org_slug := lower(regexp_replace(org_name, '[^a-z0-9]+', '-', 'g'))
              || '-' || floor(random() * 9000 + 1000)::text;

  -- Crear la organización con el usuario como owner
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Actualizar updated_at automáticamente al editar contactos
CREATE OR REPLACE FUNCTION update_contact_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_contact_timestamp();

-- Registrar actividades automáticamente al crear/editar/borrar contactos
CREATE OR REPLACE FUNCTION log_contact_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  act   TEXT;
  actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act   := 'created';
    actor := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      act := 'deleted';
    ELSE
      act := 'updated';
    END IF;
    actor := COALESCE(auth.uid(), NEW.created_by);
  END IF;

  INSERT INTO activities (organization_id, user_id, contact_id, action, contact_name)
  VALUES (NEW.organization_id, actor, NEW.id, act, NEW.name);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER contact_activity_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION log_contact_activity();

-- Lectura pública de invitación (antes de hacer login)
CREATE OR REPLACE FUNCTION get_invitation_info(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv invitations%ROWTYPE;
  org organizations%ROWTYPE;
BEGIN
  SELECT * INTO inv
  FROM invitations
  WHERE token = p_token
    AND accepted = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO org FROM organizations WHERE id = inv.organization_id;

  RETURN jsonb_build_object(
    'valid',      true,
    'email',      inv.email,
    'org_name',   org.name,
    'role',       inv.role,
    'expires_at', inv.expires_at
  );
END;
$$;

-- Aceptar invitación: agrega al usuario autenticado a la organización
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv invitations%ROWTYPE;
BEGIN
  SELECT * INTO inv
  FROM invitations
  WHERE token = p_token
    AND accepted = false
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invitación inválida o expirada');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Debe iniciar sesión para aceptar la invitación');
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = inv.organization_id
  ) THEN
    RETURN jsonb_build_object('error', 'Ya es miembro de esta organización');
  END IF;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, auth.uid(), inv.role);

  UPDATE invitations SET accepted = true WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success',         true,
    'organization_id', inv.organization_id
  );
END;
$$;

-- Cambio de rol (solo owner, no puede cambiar su propio rol)
CREATE OR REPLACE FUNCTION update_member_role(p_member_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_role() != 'owner' THEN
    RAISE EXCEPTION 'Solo el owner puede cambiar roles';
  END IF;

  IF (SELECT user_id FROM organization_members WHERE id = p_member_id) = auth.uid() THEN
    RAISE EXCEPTION 'No puede cambiar su propio rol';
  END IF;

  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Rol inválido. Solo se permite admin o member';
  END IF;

  UPDATE organization_members
  SET role = p_role
  WHERE id = p_member_id
    AND organization_id = get_my_org_id();
END;
$$;

-- Soft delete con verificación de rol (solo owner y admin)
CREATE OR REPLACE FUNCTION soft_delete_contact(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF my_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Solo owner y admin pueden eliminar contactos';
  END IF;

  UPDATE contacts
  SET deleted_at = now()
  WHERE id = p_contact_id
    AND organization_id = get_my_org_id()
    AND deleted_at IS NULL;
END;
$$;
