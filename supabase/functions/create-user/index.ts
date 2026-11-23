// =========================================================
// Edge Function: create-user
// Alta de usuarios CERRADA (admin de universidad o superadmin).
//   1. Recibe el JWT del solicitante en Authorization.
//   2. Verifica en backend su rol y universidad.
//   3. Usa el service role key (solo server-side) para crear el usuario en
//      auth.users y su fila en public.profiles dentro de la universidad.
//   4. Admin: solo su propia universidad. Superadmin: universidad indicada.
//   5. El rol superadmin NO se puede asignar por API (solo manual en BD).
// Despliegue: supabase functions deploy create-user --no-verify-jwt
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

// superadmin queda fuera a propósito: se asigna manualmente en la BD.
const VALID_ROLES = ['usuario', 'seguridad', 'ti', 'admin'] as const
type Role = (typeof VALID_ROLES)[number]

const PROFILE_SELECT =
  'id, full_name, role, department_id, zone_id, phone, organization_id, organizations(name)'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function mapProfile(row: Record<string, unknown>) {
  const organization = row.organizations as { name?: string | null } | null | undefined
  return {
    id: row.id,
    email: '',
    name: row.full_name,
    role: row.role,
    departmentId: row.department_id ?? null,
    zoneId: row.zone_id ?? null,
    phone: row.phone ?? null,
    organizationId: row.organization_id ?? null,
    organizationName: organization?.name ?? null,
  }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  // Las claves nuevas de Supabase se llaman SUPABASE_SECRET_KEY (sb_secret_...).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Edge Function sin configurar (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY).' }, 500)
  }

  // ---- 1. Identidad del solicitante a partir de su JWT ----
  const authHeader = req.headers.get('Authorization') ?? ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) {
    return json({ error: 'Falta la cabecera Authorization con el token del usuario.' }, 401)
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await caller.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return json({ error: 'Token inválido o expirado.' }, 401)
  }

  // ---- 2. Verificación de rol y universidad en el servidor ----
  const { data: role, error: roleError } = await caller.rpc('current_role')
  if (roleError) {
    return json({ error: `No se pudo verificar el rol: ${roleError.message}` }, 500)
  }
  if (role !== 'admin' && role !== 'superadmin') {
    return json({ error: 'Solo un administrador o superadmin puede crear usuarios.' }, 403)
  }

  const { data: callerProfile, error: callerError } = await caller
    .from('profiles')
    .select('organization_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (callerError) {
    return json({ error: `No se pudo leer el perfil del solicitante: ${callerError.message}` }, 500)
  }
  if (role === 'admin' && !callerProfile?.organization_id) {
    return json({ error: 'Tu usuario no tiene una universidad asignada.' }, 409)
  }

  // ---- 3. Validación del cuerpo ----
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400)
  }

  const fullName = text(body.fullName)
  const email = text(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const userRole = body.role
  const requestedOrg = text(body.organizationId)

  if (!fullName) return json({ error: 'El nombre completo es obligatorio.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo inválido.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
  if (!isRole(userRole)) {
    return json({ error: 'Rol no válido. El superadmin solo se asigna manualmente.' }, 400)
  }

  let targetOrg: string | null
  if (role === 'superadmin') {
    if (!requestedOrg) {
      return json({ error: 'Selecciona la universidad destino para el usuario.' }, 400)
    }
    targetOrg = requestedOrg
  } else {
    targetOrg = callerProfile?.organization_id ?? null
    if (requestedOrg && requestedOrg !== targetOrg) {
      return json({ error: 'No puedes crear usuarios en otra universidad.' }, 403)
    }
  }
  if (!targetOrg) {
    return json({ error: 'No se pudo determinar la universidad destino.' }, 400)
  }

  // ---- 4. Creación con service role (solo server-side) ----
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id, name, status')
    .eq('id', targetOrg)
    .maybeSingle()
  if (organizationError) {
    return json({ error: `No se pudo validar la universidad: ${organizationError.message}` }, 500)
  }
  if (!organization) {
    return json({ error: 'La universidad destino no existe.' }, 404)
  }
  if (organization.status !== 'activa') {
    return json({ error: 'La universidad está suspendida.' }, 409)
  }

  // Comprobación amistosa; los triggers de la BD vuelven a validar licencia y límites.
  const { data: usage, error: usageError } = await admin.rpc('license_usage', { p_org: targetOrg })
  if (!usageError && usage) {
    const record = usage as Record<string, unknown>
    if (record.status !== 'activa') {
      return json({ error: `La licencia no está activa (${String(record.status ?? 'sin_licencia')}).` }, 409)
    }
    if (Number(record.user_count ?? 0) >= Number(record.max_users ?? 0)) {
      return json({ error: 'Se alcanzó el límite de usuarios de la licencia.' }, 409)
    }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { organization_id: targetOrg },
    user_metadata: { full_name: fullName, phone: body.phone ?? null },
  })

  if (createError || !created.user) {
    const duplicate = /already been registered|already exists/i.test(createError?.message ?? '')
    return json(
      { error: duplicate ? 'Ese correo ya tiene una cuenta.' : `No se pudo crear el usuario: ${createError?.message}` },
      duplicate ? 409 : 400
    )
  }

  // El trigger handle_new_user crea el perfil con role = 'usuario' y la
  // organización de app_metadata; aquí se completa el rol y la asignación.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      role: userRole,
      department_id: body.departmentId ?? null,
      zone_id: body.zoneId ?? null,
      phone: body.phone ?? null,
    })
    .eq('id', created.user.id)
    .select(PROFILE_SELECT)
    .single()

  if (profileError || !profile) {
    // No dejamos un usuario huérfano sin perfil utilizable.
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: `Usuario creado pero sin perfil: ${profileError?.message ?? 'perfil no encontrado'}` }, 500)
  }

  return json({ user: { ...mapProfile(profile as Record<string, unknown>), email } }, 201)
})
