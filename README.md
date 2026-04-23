# SendFlow — Sistema de Gestión Logística

Sistema web para gestión de envíos con integración a Shopify, WooCommerce, Jumpseller y Mercado Libre Flex.

## Stack
- Next.js 14 + TypeScript
- PostgreSQL (Supabase)
- Prisma ORM
- NextAuth v5
- Supabase Storage (fotos de evidencia)
- Vercel (hosting + crons)

## Setup local

```bash
npm install
cp .env.example .env
# Completar .env con credenciales de Supabase

npx prisma db push
npm run db:seed
npm run dev
```

## Variables de entorno requeridas

Ver `.env.example`

## Deploy

1. Conectar repo a Vercel
2. Agregar variables de entorno en Vercel dashboard
3. Deploy automático en cada push a main
