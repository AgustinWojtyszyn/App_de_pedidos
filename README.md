<div align="center">

# ServiFood · App de Pedidos

**Plataforma web para gestionar pedidos corporativos de alimentación, operación multiempresa, reportes y administración.**

<p>
  <img src="https://img.shields.io/badge/Estado-En%20desarrollo%20activo-16a34a?style=for-the-badge" alt="Estado: desarrollo activo" />
  <img src="https://img.shields.io/badge/Arquitectura-Multiempresa-2563eb?style=for-the-badge" alt="Arquitectura multiempresa" />
  <img src="https://img.shields.io/badge/Deploy-Render-0f172a?style=for-the-badge&logo=render&logoColor=white" alt="Render" />
</p>

<p>
  <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 7" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Vitest-Testing-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
</p>

</div>

---

## Sobre el proyecto

**ServiFood · App de Pedidos** centraliza la gestión diaria de pedidos corporativos, menús, empresas, sedes, permisos, reportes y automatizaciones operativas.

| Pedidos y operación | Administración y análisis |
|---|---|
| Pedidos diarios y extras | Usuarios, roles y permisos |
| Menús dinámicos por empresa | Panel diario y mensual |
| Horarios y reglas operativas | Reportes de consumo |
| Sedes y ubicaciones | Tendencias y totalización |
| Cafetería y etiquetas | Auditoría y salud del sistema |
| Estados y validaciones | Exportaciones y automatizaciones |

## Stack tecnológico

### Frontend

![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=flat-square&logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router_7-CA4245?style=flat-square&logo=reactrouter&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-State-443E38?style=flat-square)
![Zod](https://img.shields.io/badge/Zod-Validation-3E67B1?style=flat-square)
![React Hook Form](https://img.shields.io/badge/React_Hook_Form-EC5990?style=flat-square&logo=reacthookform&logoColor=white)

Interfaz desarrollada con **React 19**, **Vite 7**, **React Router 7**, **Tailwind CSS 4**, **Framer Motion**, **Zustand**, **Zod**, **React Hook Form**, **Lucide React** y **DOMPurify**.

### Backend y datos

![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Deno](https://img.shields.io/badge/Deno-Edge_Functions-000000?style=flat-square&logo=deno&logoColor=white)

**Supabase** concentra autenticación, PostgreSQL, acceso a datos y lógica server-side. El proyecto utiliza además **Deno** para funciones y automatizaciones del entorno Supabase.

### Reportes, comunicación y calidad

![ExcelJS](https://img.shields.io/badge/ExcelJS-217346?style=flat-square&logo=microsoftexcel&logoColor=white)
![jsPDF](https://img.shields.io/badge/jsPDF-PDF-b91c1c?style=flat-square)
![Nodemailer](https://img.shields.io/badge/Nodemailer-Email-22c55e?style=flat-square)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=flat-square&logo=eslint&logoColor=white)

- **ExcelJS** — exportación de reportes a Excel.
- **jsPDF** — generación de documentos PDF.
- **Nodemailer** — envío de emails.
- **Vitest** — tests automatizados.
- **ESLint** — análisis estático.
- **Playwright** — pruebas E2E del flujo de etiquetas.
- **Unlighthouse** — auditorías de rendimiento.

## Instalación local

```bash
git clone https://github.com/AgustinWojtyszyn/App_de_pedidos.git
cd App_de_pedidos
npm install
```

Crear `.env` con las variables públicas necesarias para Supabase:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica
```

Ejecutar:

```bash
npm run dev
```

## Scripts principales

| Comando | Uso |
|---|---|
| `npm run dev` | Desarrollo local |
| `npm run build` | Build de producción |
| `npm run lint` | Análisis estático |
| `npm test` | Tests automatizados |
| `npm run test:e2e:labels` | E2E del flujo de etiquetas |
| `npm run test:load` | Pruebas de carga |
| `npm run audit:unlighthouse` | Auditoría web |

## Seguridad

Las variables `VITE_*` son públicas para el frontend. No deben contener `service_role`, contraseñas, tokens privados ni secretos administrativos.

La aplicación complementa las validaciones del cliente con controles de acceso y lógica del lado de Supabase.

---

<div align="center">

**Desarrollado por [Agustin Wojtyszyn](https://github.com/AgustinWojtyszyn)**

</div>
