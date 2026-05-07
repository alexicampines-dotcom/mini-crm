'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import Link from 'next/link'
import LogoutButton from '@/components/logout-button'

type Member = {
    id: string
    user_id: string
    role: string
    email: string
    created_at: string
}

export default function TeamPage() {
    const [members, setMembers] = useState<Member[]>([])
    const [userRole, setUserRole] = useState('')
    const [orgName, setOrgName] = useState('')
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('member')
    const [inviteLink, setInviteLink] = useState('')
    const supabase = createClient()

    useEffect(() => {
        loadTeam()
    }, [])

    async function loadTeam() {
        setLoading(true)

        const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .single()
        setOrgName(org?.name || 'Mini CRM')

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: myMember } = await supabase
            .from('organization_members')
            .select('role')
            .eq('user_id', user.id)
            .single()
        setUserRole(myMember?.role || '')

        const { data: teamMembers } = await supabase.rpc('get_team_members')
        setMembers(teamMembers || [])
        setLoading(false)
    }

    async function handleInvite() {
        if (!inviteEmail) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: myMember } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()
        if (!myMember) return

        const { data, error } = await supabase
            .from('invitations')
            .insert({
                organization_id: myMember.organization_id,
                invited_by: user.id,
                email: inviteEmail,
                role: inviteRole,
            })
            .select('token')
            .single()

        if (error) {
            console.log('invite error:', error)
            alert('Error al crear invitación: ' + error.message)
            return
        }

        const link = `${window.location.origin}/invite/${data.token}`
        setInviteLink(link)
    }

    async function handleRoleChange(memberId: string, newRole: string) {
        const { error } = await supabase.rpc('update_member_role', {
            p_member_id: memberId,
            p_role: newRole,
        })

        if (error) {
            alert('Error: ' + error.message)
            return
        }

        loadTeam()
    }
    async function handleRemoveMember(memberId: string) {
        console.log('handleRemoveMember called', memberId)
        if (!confirm('¿Estás seguro de que quieres eliminar este miembro?')) return

        const { error } = await supabase
            .rpc('remove_member', { p_user_id: memberId })

        console.log('delete error:', error)

        if (error) {
            alert('Error: ' + error.message)
            return
        }

        loadTeam()
    }

    function getRoleBadge(role: string) {
        if (role === 'owner') return <Badge className="bg-yellow-500">Owner</Badge>
        if (role === 'admin') return <Badge className="bg-blue-500">Admin</Badge>
        return <Badge variant="secondary">Member</Badge>
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold">{orgName}</h1>
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
                </nav>
            </header>

            <main className="max-w-3xl mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Equipo</h2>
                    {userRole === 'owner' && (
                        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                            <DialogTrigger asChild>
                                <Button>Invitar miembro</Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Invitar nuevo miembro</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            placeholder="correo@ejemplo.com"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rol</Label>
                                        <select
                                            value={inviteRole}
                                            onChange={(e) => setInviteRole(e.target.value)}
                                            className="w-full border rounded-md p-2"
                                        >
                                            <option value="member">Member</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                    {!inviteLink ? (
                                        <Button type="button" onClick={handleInvite} className="w-full">
                                            Generar enlace de invitación
                                        </Button>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label>Enlace de invitación (expira en 7 días):</Label>
                                            <div className="flex gap-2">
                                                <Input value={inviteLink} readOnly />
                                                <Button
                                                    type="button"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(inviteLink)
                                                        alert('Enlace copiado')
                                                    }}
                                                >
                                                    Copiar
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>

                {loading ? (
                    <p className="text-muted-foreground">Cargando...</p>
                ) : (
                    <div className="space-y-4">
                        {members.map((member) => (
                            <Card key={member.id}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <p className="font-semibold">{member.email}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Desde {new Date(member.created_at).toLocaleDateString('es-PA')}
                                            </p>
                                        </div>
                                        {getRoleBadge(member.role)}
                                    </div>
                                    {userRole === 'owner' && member.role !== 'owner' && (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                className="border rounded-md p-1 text-sm"
                                            >
                                                <option value="admin">Admin</option>
                                                <option value="member">Member</option>
                                            </select>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                type="button"
                                                onClick={() => handleRemoveMember(member.user_id)}
                                            >
                                                Eliminar
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}