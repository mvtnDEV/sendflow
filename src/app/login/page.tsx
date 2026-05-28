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
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      if (res.error.includes('TOO_MANY_ATTEMPTS')) {
        setError('Demasiados intentos fallidos. Espera 15 minutos.')
      } else {
        setError('Email o contraseña incorrectos')
      }
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg-base)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Fondo decorativo */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>

      {/* Card login */}
      <div style={{
        margin: 'auto',
        background: 'var(--bg-card)',
        borderRadius: 20,
        border: '1px solid var(--border)',
        padding: '40px 36px',
        width: '100%', maxWidth: 400,
        position: 'relative',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 22V8l10 8 10-8v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px', margin: 0 }}>
            Moovex
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Ingresa a tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@moovex.cl" required
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 10, fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
                color: 'var(--text-primary)',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          {/* Contraseña */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', padding: '10px 40px 10px 14px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, fontSize: 13,
                  outline: 'none', fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  transition: 'border-color 0.15s',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 0, display: 'flex',
                }}>
                {showPass
                  ? <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2l12 12M8 3C4 3 1 8 1 8s.8 1.3 2.1 2.6M13.9 5.4C15.2 6.7 16 8 16 8s-3 5-7 5c-1.1 0-2.1-.3-3-.7"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, padding: '10px 14px',
              fontSize: 13, color: '#FCA5A5', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.5h1.5v4.5h-1.5V4.5zm.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
              {error}
            </div>
          )}

          {/* Botón */}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: loading
                ? 'var(--bg-input)'
                : 'linear-gradient(135deg, #6366F1, #4F46E5)',
              color: loading ? 'var(--text-muted)' : 'white',
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.4)',
            }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 20, padding: '10px 14px',
          background: 'var(--bg-input)',
          borderRadius: 8, fontSize: 11,
          color: 'var(--text-muted)', textAlign: 'center',
        }}>
          Máximo 5 intentos por cada 15 minutos
        </div>
      </div>
    </div>
  )
}
