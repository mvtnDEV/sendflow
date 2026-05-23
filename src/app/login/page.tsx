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
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      if (res.error.includes('TOO_MANY_ATTEMPTS')) {
        setError('Demasiados intentos fallidos. Espera 15 minutos antes de intentar de nuevo.')
      } else {
        setError('Email o contraseña incorrectos')
      }
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F0F4F8' }}>
      <div style={{ background:'white', borderRadius:16, border:'1px solid #E2E8F0', padding:'40px 36px', width:'100%', maxWidth:400 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'#0B1628', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            {/* Icono M de Moovex */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 22V8l10 8 10-8v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'#0B1628', letterSpacing:'-0.5px' }}>
            Moovex
          </h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>
            Gestión logística
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@moovex.cl" required
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }}/>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#4B5563', display:'block', marginBottom:5 }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              style={{ width:'100%', padding:'9px 12px', border:'1px solid #E2E8F0', borderRadius:8, fontSize:13, outline:'none', fontFamily:'inherit' }}/>
          </div>

          {error && (
            <div style={{ background:'#FFF1F2', border:'1px solid #FECDD3', borderRadius:8, padding:'8px 12px', fontSize:13, color:'#9F1239', marginBottom:14 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'11px', background:loading?'#93C5FD':'#2563EB', color:'white', border:'none', borderRadius:8, fontSize:14, fontWeight:500, cursor:loading?'not-allowed':'pointer', fontFamily:'inherit' }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div style={{ marginTop:20, padding:'10px 12px', background:'#F8FAFC', borderRadius:8, fontSize:11, color:'#9CA3AF', textAlign:'center' }}>
          Máximo 5 intentos por cada 15 minutos
        </div>
      </div>
    </div>
  )
}
