# TALENTO MOCHE — Sistema web de reclutamiento de personal de campo

Proyecto académico (Cibertec — Diplomado en Innovación e Integración Tecnológica, 2026).
Sistema web para que una empresa agroexportadora registre, asigne y haga seguimiento a sus
postulantes de campo hasta su ingreso como trabajadores.

## Funcionalidades
- Portal público de postulación desde el celular, con validación de DNI y lista de no aptos.
- Panel de la Jefa de Reclutamiento: campañas, postulantes, asignación masiva a contratas, dashboard.
- Panel de la contrata: postulantes asignados y registro del resultado de cada llamada.
- Día del llamado con código QR: el postulante confirma su asistencia y pasa a Trabajadores.
- Productividad por contrata, historial de llamadas, importación desde Excel.
- Administración de usuarios, roles y permisos (RBAC) y auditoría de acciones.

## Tecnologías
| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js 20 + Express + TypeScript (API REST, JWT, bcrypt) |
| Base de datos | MySQL 8 |

## Ejecución local
1. Crear la base de datos con `database/install_completo.sql`.
2. Copiar `backend/.env.example` a `backend/.env` y completar los valores (incluida `SEED_ADMIN_PASSWORD`).
3. Backend: `cd backend && npm install && npm run seed && npm run dev`
4. Frontend: `cd frontend && npm install && npm run dev`

> Los nombres, correos y datos de ejemplo son ficticios.
