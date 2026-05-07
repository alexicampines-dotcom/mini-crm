import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import LogoutButton from '@/components/logout-button'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Total de contactos activos
  const { count: totalContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })

  // Contactos creados esta semana
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const { count: weekContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneWeekAgo.toISOString())

  // Últimas 10 actividades
  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  // Info de la organización
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{org?.name || 'Mini CRM'}</h1>
        <nav className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">Dashboard</Button>
          </Link>
          <Link href="/contacts">
            <Button variant="ghost" size="sm">Contactos</Button>
          </Link>
          <Link href="/team">
            <Button variant="ghost" size="sm">Equipo</Button>
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Total de contactos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalContacts || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Nuevos esta semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{weekContacts || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Últimas actividades</CardTitle>
          </CardHeader>
          <CardContent>
            {activities && activities.length > 0 ? (
              <ul className="space-y-3">
                {activities.map((activity) => (
                  <li
                    key={activity.id}
                    className="flex items-center justify-between text-sm border-b pb-2"
                  >
                    <span>
                      {activity.action === 'created' && '➕ Se creó'}
                      {activity.action === 'updated' && '✏️ Se editó'}
                      {activity.action === 'deleted' && '🗑️ Se eliminó'}
                      {' '}<strong>{activity.contact_name}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(activity.created_at).toLocaleDateString('es-PA')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No hay actividades aún. Crea tu primer contacto.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}