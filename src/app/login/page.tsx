'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#F0F4F8',
    }}>
      <div style={{
        background: 'white', borderRadius: 16,
        border: '1px solid #E2E8F0',
        padding: '40px 36px', width: '100%', maxWidth: 400,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#0B1628', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <svg width="24" height="24" viewBox="0 0 16 16" fill="white">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 2.2L13 6l-5 2.8L3 6l5-2.8zM2 7.2l5 2.8v4.6L2 11.8V7.2zm6 7.4V9.8l5-2.8v4.6L8 14.6z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#0B1628' }}>
            Send<span style={{ color: '#2563EB' }}>Flow</span>
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            Gestión logística
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@sendflow.cl"
              required
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid #E2E8F0', borderRadius: 8,
                fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#4B5563', display: 'block', marginBottom: 5 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '9px 12px',
                border: '1px solid #E2E8F0', borderRadius: 8,
                fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FFF1F2', border: '1px solid #FECDD3',
              borderRadius: 8, padding: '8px 12px',
              fontSize: 13, color: '#9F1239', marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? '#93C5FD' : '#2563EB',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
