# Setup en Nuevo Ordenador

## 1. Instalar prerequisitos
- **Node.js** (v20+): https://nodejs.org
- **Git**: https://git-scm.com

## 2. Clonar el repositorio
```bash
git clone https://github.com/Enteza-Alquisillas/ControlCompras.git
cd ControlCompras
```

## 3. Instalar dependencias
```bash
npm install
```

## 4. Crear el archivo `.env.local`
Copia el ejemplo incluido en el repo (ya tiene las claves reales):
```bash
copy .env.example .env.local
```

## 5. Arrancar
```bash
npm run dev
```

---

## Lo que NO necesitas trasladar
- La base de datos — está en **Supabase cloud**, accesible desde cualquier sitio
- `node_modules` — se regenera con `npm install`

## Opcional: SQL Server
Si necesitas la importación desde SQL Server (Sevilla/Jerez), añade las IPs de red al `.env.local`. Solo funciona estando en la red local de la empresa.

---

## Contexto del agente IA (Claude Code)

### Lo que ya viene con el repo (automático al clonar)
Todo el contexto del agente está versionado en GitHub:

| Carpeta/Archivo | Contenido |
|----------------|-----------|
| `CLAUDE.md` | Instrucciones principales del agente |
| `BUSINESS_LOGIC.md` | Lógica de negocio del proyecto |
| `.claude/PROJECT_STATUS.md` | Estado actual de la implementación |
| `.claude/PRPs/` | Product Requirements Proposals |
| `.claude/agents/` | Definiciones de agentes especializados |
| `.claude/skills/` | Skills del agente |
| `.claude/prompts/` | Blueprints del bucle agéntico |
| `.claude/ai_templates/` | Templates de IA |
| `.claude/design-systems/` | Sistemas de diseño |

### Lo que debes copiar manualmente
La memoria persistente de Claude Code está **fuera del proyecto**, en:
```
C:\Users\carry\.claude\projects\C--Users-carry-OneDrive-Documentos-Proyectos-new-machu\memory\
```
Contiene aprendizajes de conversaciones anteriores (integraciones Odoo, partners, etc.).

Cópiala a la misma ruta en el nuevo ordenador para que el agente los tenga disponibles.

### Instalar Claude Code en el nuevo ordenador
```bash
npm install -g @anthropic-ai/claude-code
```
Luego autentícate con tu cuenta de Anthropic.
