// =========================================================
// Edge Function: create-user
// Alta de usuarios CERRADA (solo admin).
//   1. Recibe el JWT del admin en la cabecera Authorization.
//   2. Verifica en backend que current_role() = 'admin'.
//   3. Usa el service role key (solo server-side) para crear el usuario en
//      auth.users y su fila en public.profiles con el rol elegido.
//   4. Responde 403 si el solicitante no es admin.
// Despliegue: supabase functions deploy create-user --no-verify-jwt
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const VALID_ROLES = ['usuario', 'seguridad', 'ti', 'admin'] as const
type Role = (typeof VALID_ROLES)[number]

const PROFILE_SELECT = 'id, full_name, role, department_id, zone_id, phone'

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
  return {
    id: row.id,
    email: '',
    name: row.full_name,
    role: row.role,
    departmentId: row.department_id ?? null,
    zoneId: row.zone_id ?? null,
    phone: row.phone ?? null,
  }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
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
    return json({ error: 'Falta la cabecera Authorization con el token del administrador.' }, 401)
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userError } = await caller.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return json({ error: 'Token inválido o expirado.' }, 401)
  }

  // ---- 2. Verificación de rol en el servidor (no confías en el cliente) ----
  const { data: role, error: roleError } = await caller.rpc('current_role')
  if (roleError) {
    return json({ error: `No se pudo verificar el rol: ${roleError.message}` }, 500)
  }
  if (role !== 'admin') {
    return json({ error: 'Solo un administrador puede crear usuarios.' }, 403)
  }

  // ---- 3. Validación del cuerpo ----
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400)
  }

  const fullName = String(body.fullName ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const userRole = body.role

  if (!fullName) return json({ error: 'El nombre completo es obligatorio.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo inválido.' }, 400)
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)
  if (!isRole(userRole)) return json({ error: 'Rol no válido.' }, 400)

  // ---- 4. Creación con service role (solo server-side) ----
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: body.phone ?? null },
  })

  if (createError || !created.user) {
    const duplicate = /already been registered|already exists/i.test(createError?.message ?? '')
    return json(
      { error: duplicate ? 'Ese correo ya tiene una cuenta.' : `No se pudo crear el usuario: ${createError?.message}` },
      duplicate ? 409 : 400
    )
  }

  // El trigger on_auth_created crea el perfil con role = 'usuario';
  // aquí se sobrescribe con el rol elegido y se asignan dept/zona/teléfono.
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