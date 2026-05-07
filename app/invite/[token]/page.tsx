'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [inviteInfo, setInviteInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadInviteInfo()
  }, [])

  async function loadInviteInfo() {
    const { data } = await supabase.rpc('get_invitation_info', { p_token: token })
    setInviteInfo(data)
    if (data?.email) setEmail(data.email)
    setLoading(false)
  }

  async function handleAccept() {
    setAccepting(true)
    setError('')

    // Intentar registrar al usuario
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          skip_org_creation: true,
        },
      },
    })

    if (signUpError) {
      // Si ya existe, intentar login
      if (signUpError.message.includes('already registered')) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (loginError) {
          setError(loginError.message)
          setAccepting(false)
          return
        }
      } else {
        setError(signUpError.message)
        setAccepting(false)
        return
      }
    }

    // Aceptar la invitación
    const { data } = await supabase.rpc('accept_invitation', { p_token: token })

    if (data?.error) {
      setError(data.error)
      setAccepting(false)
      return
    }

    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Cargando invitación...</p>
      </div>
    )
  }

  if (!inviteInfo?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitación inválida</CardTitle>
            <CardDescription>
              Este enlace de invitación ha expirado o ya fue utilizado.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Únete a {inviteInfo.org_name}</CardTitle>
          <CardDescription>
            Has sido invitado como <strong>{inviteInfo.role}</strong>.
            Crea tu cuenta o inicia sesión para aceptar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button
              type="button"
              onClick={handleAccept}
              className="w-full"
              disabled={accepting}
            >
              {accepting ? 'Aceptando...' : 'Aceptar invitación'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}