'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import LogoutButton from '@/components/logout-button'

type Contact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  tags: string[]
  created_at: string
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [orgName, setOrgName] = useState('')
  const [userRole, setUserRole] = useState('')
  const supabase = createClient()

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formTags, setFormTags] = useState('')

  const loadContacts = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
      )
    }

    if (tagFilter) {
      query = query.contains('tags', [tagFilter])
    }

    const { data } = await query
    setContacts(data || [])
    setLoading(false)
  }, [search, tagFilter])

  useEffect(() => {
    loadContacts()
    loadOrgInfo()
  }, [loadContacts])

  async function loadOrgInfo() {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .single()
    setOrgName(org?.name || 'Mini CRM')

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .single()
      setUserRole(member?.role || '')
    }
  }

  function openCreate() {
    setEditingContact(null)
    setFormName('')
    setFormEmail('')
    setFormPhone('')
    setFormCompany('')
    setFormNotes('')
    setFormTags('')
    setDialogOpen(true)
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact)
    setFormName(contact.name)
    setFormEmail(contact.email || '')
    setFormPhone(contact.phone || '')
    setFormCompany(contact.company || '')
    setFormNotes(contact.notes || '')
    setFormTags(contact.tags.join(', '))
    setDialogOpen(true)
  }

 async function handleSave() {
    console.log('handleSave called')
    
    const { data: { user } } = await supabase.auth.getUser()
    console.log('user:', user)
    if (!user) return

    const tags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== '')

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    console.log('member:', member)
    if (!member) return

    if (editingContact) {
      const { error } = await supabase
        .from('contacts')
        .update({
          name: formName,
          email: formEmail || null,
          phone: formPhone || null,
          company: formCompany || null,
          notes: formNotes || null,
          tags,
        })
        .eq('id', editingContact.id)
      console.log('update error:', error)
    } else {
      const { error } = await supabase.from('contacts').insert({
        name: formName,
        email: formEmail || null,
        phone: formPhone || null,
        company: formCompany || null,
        notes: formNotes || null,
        tags,
        organization_id: member.organization_id,
        created_by: user.id,
      })
      console.log('insert error:', error)
    }

 
    setDialogOpen(false)
    loadContacts()
  }

  async function handleDelete(contactId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este contacto?')) return

    await supabase.rpc('soft_delete_contact', { p_contact_id: contactId })
    loadContacts()
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

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Contactos</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>Nuevo contacto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingContact ? 'Editar contacto' : 'Nuevo contacto'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Juan Pérez"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="juan@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+507 6000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Input
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Empresa S.A."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Notas sobre el contacto..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Etiquetas (separadas por coma)</Label>
                  <Input
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="cliente, panama, tech"
                  />
                </div>
                <Button type="button" onClick={() => { console.log('click detected'); handleSave(); }} className="w-full">
                  {editingContact ? 'Guardar cambios' : 'Crear contacto'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-4">
          <Input
            placeholder="Buscar por nombre, email o empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Input
            placeholder="Filtrar por etiqueta..."
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : contacts.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground text-center">
                No hay contactos. Crea el primero.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {contacts.map((contact) => (
              <Card key={contact.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{contact.name}</p>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      {contact.email && <span>{contact.email}</span>}
                      {contact.phone && <span>{contact.phone}</span>}
                      {contact.company && <span>{contact.company}</span>}
                    </div>
                    {contact.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {contact.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(contact)}
                    >
                      Editar
                    </Button>
                    {(userRole === 'owner' || userRole === 'admin') && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(contact.id)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}