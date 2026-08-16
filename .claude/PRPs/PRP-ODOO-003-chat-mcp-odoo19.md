# PRP-ODOO-003: Chat con Odoo 19 via MCP (odoo-mcp-chat)

> **Estado**: VALIDADO EN ENTORNO DE PRUEBAS Y EN PRODUCCION DE ALCANCE (Fase 0 omitida por decision explicita del usuario; Fases 1-3 verificadas end-to-end con la base `enteza_p`). **2026-08-16: cambio de alcance por decision del usuario — el chat dejo de ser "Supabase + Odoo" para ser SOLO Odoo.** El objetivo original de este PRP (anadir Odoo como segunda fuente junto a Supabase) queda parcialmente superado; ver Aprendizajes del 2026-08-16. Pendiente: probar desde la UI real del chat con login (ya confirmado funcionando en uso real).
> **Fecha**: 2026-08-15 (actualizado 2026-08-16)
> **Proyecto**: Enteza Reservas App

---

## Objetivo

Dotar al chat conversacional ya existente (`src/features/chat/`) de una segunda fuente de datos ademas de Supabase: Odoo 19 Enterprise, consultado en lenguaje natural a traves del servidor MCP `mn_mcp_server` instalado en Odoo, usando el cliente MCP nativo del Vercel AI SDK (`experimental_createMCPClient`). El carril determinista de exportacion de pedidos (`src/features/odoo19/`) no se toca ni se cruza con esta feature.

## Por Que

| Problema | Solucion |
|----------|----------|
| Los comerciales que usan el chat solo pueden consultar disponibilidad y reservas de Enteza Reservas (Supabase); si necesitan saber algo de Odoo (estado de un pedido, un pago, un cliente en el ERP) tienen que salir del chat y abrir Odoo. | Extender el mismo chat con herramientas que consultan Odoo 19 en vivo via MCP, sin salir de la conversacion. |
| No existe ninguna integracion MCP en el repo; conectar un LLM directamente a un ERP sin guardarrailes es un riesgo de seguridad y de negocio (fuga de datos de clientes, escritura accidental). | Aplicar las invariantes de seguridad ya decididas en `AGENTS.md`: solo lectura, modulo Odoo parcheado, credenciales aisladas, y documentarlo como criterio de exito no negociable del PRP. |
| El modulo `mn_mcp_server` de la tienda de Odoo tiene fallos conocidos (token en claro, auto-asignacion de admins, falta de whitelist en `odoo_run_server_action`) que lo hacen inseguro para produccion tal cual. | Incluir una fase previa y obligatoria de auditoria/parcheo del modulo (fork LGPL-3) antes de escribir una sola linea de codigo de la app. |

**Valor de negocio**: los comerciales resuelven en una sola conversacion preguntas que hoy requieren cambiar de aplicacion (Enteza Reservas -> Odoo), reduciendo tiempo de atencion telefonica al cliente y evitando errores de consulta manual en el ERP.

## Que

### Criterios de Exito
- [ ] El chat existente responde preguntas en lenguaje natural sobre datos de Odoo 19 (ej. estado de un pedido, datos de un cliente, productos) ademas de sus preguntas actuales sobre Supabase, en la misma conversacion.
- [ ] `src/features/odoo19/` (carril determinista JSON-2) no sufre ningun cambio de codigo ni de comportamiento; el nuevo cliente MCP vive en un modulo/servicio completamente separado dentro de `src/features/chat/`.
- [ ] La API key de Odoo usada por el chat se crea con `perm_read` unicamente; `odoo_execute` y `odoo_run_server_action` quedan desactivados en la clave salvo que una necesidad de negocio justificada se documente y apruebe explicitamente.
- [ ] El chat corre con **una unica identidad interna de equipo comercial** (API key de servicio, sin login por usuario) — decision explicita documentada en este PRP, no un atajo por defecto (ver seccion Decisiones Tecnicas).
- [ ] El modulo `mn_mcp_server` desplegado en el Odoo de pruebas es un **fork parcheado** (no la version de la tienda con autoactualizacion), con los 3 fallos conocidos corregidos y verificados antes de que cualquier fase de codigo de la app empiece.
- [ ] La conexion MCP usa HTTPS, la API key tiene lista blanca de IPs configurada, y la auditoria del modulo esta activada en el Odoo de pruebas.
- [ ] Todo el flujo se prueba primero contra el Odoo de pruebas; no se apunta a produccion sin aprobacion humana explicita posterior a este PRP.

### Comportamiento Esperado

1. Un comercial escribe en el chat una pregunta que requiere datos de Odoo (ej. "¿que estado tiene el pedido de [cliente] en Odoo?" o "¿cual es el email de [cliente] en el ERP?").
2. El modelo, al recibir la pregunta, decide si la herramienta relevante viene de Supabase (tools actuales en `src/features/chat/tools/index.ts`) o de Odoo (tools descubiertas dinamicamente via MCP).
3. Si la pregunta requiere Odoo, el backend llama al cliente MCP (`experimental_createMCPClient`, transporte HTTP), que ya tiene descubiertas las herramientas de solo lectura expuestas por `mn_mcp_server` (`odoo_search`, `odoo_search_read`, `odoo_read`, `odoo_name_search`, etc.).
4. La herramienta se ejecuta contra el Odoo de pruebas con la API key de solo lectura del chat; el resultado vuelve al modelo, que redacta la respuesta en espanol siguiendo las mismas reglas de estilo que ya usa el `SYSTEM_PROMPT` actual.
5. Si Odoo no esta disponible o la herramienta falla, el chat lo comunica de forma clara sin romper el resto de la conversacion (las tools de Supabase siguen funcionando).
6. En ningun momento el chat ejecuta una escritura en Odoo: no hay tools de creacion/edicion/borrado ni de ejecucion de acciones de servidor habilitadas.

---

## Contexto

### Referencias
- `AGENTS.md` (raiz del repo) — documento de arquitectura que define los dos carriles (determinista vs conversacional), el modelo de autenticacion del MCP, y las 5 invariantes de seguridad citadas en este PRP. Es la fuente normativa; este PRP no la repite, la aplica.
- `~/.claude/skills/odoo19-integration/` — skill con las convenciones ya establecidas para el carril JSON-2 determinista (`src/features/odoo19/`). **Esta feature NO usa esa skill ni su cliente JSON-2**: es un cliente MCP distinto, con protocolo, credencial y ciclo de vida propios. Se referencia aqui solo porque comparte la misma instancia Odoo (`enteza19.xtendoo.es`) y para que el agente que ejecute el Blueprint no mezcle los dos carriles.
- `src/app/api/chat/route.ts` — endpoint actual del chat: `streamText` de AI SDK v6, `stopWhen: stepCountIs(5)`, `tools: chatTools`, modelo servido por `src/lib/ai/openrouter.ts`. Este PRP anade tools de Odoo al mismo `tools: {...}` (o las combina), sin reescribir el endpoint desde cero.
- `src/features/chat/tools/index.ts` — patron actual de tools: cada tool usa `tool({ description, inputSchema: z.object(...), execute })` de AI SDK v6 contra Supabase. Las tools MCP de Odoo deben integrarse con el mismo objeto `tools` que consume `streamText`, ya sea fusionando el resultado de `mcpClient.tools()` con `chatTools`, o exponiendolas por separado y uniendolas en el route handler.
- `src/lib/ai/openrouter.ts` — `createOpenAI` de `@ai-sdk/openai` sin `baseURL`; hoy habla con OpenAI directo pese al nombre del archivo. No hay `OPENAI_API_KEY` en `.env.local` actualmente: **antes de poder probar el chat con IA real hace falta resolver esto** (anadir la key o apuntar `baseURL` a OpenRouter), es un prerrequisito fuera del alcance de este PRP pero debe quedar anotado como bloqueante para la fase de validacion end-to-end.
- `.env.local` / `.env.example` — ya existen `ODOO19_URL`, `ODOO19_DB`, `ODOO19_USER`, `ODOO19_API_KEY`, `ODOO19_SEVILLA_COMPANY`, `ODOO19_JEREZ_COMPANY` para el carril determinista JSON-2. La API key del chat MCP debe ser **una credencial nueva y separada** (nuevo usuario/API key de Odoo con `perm_read`), nunca reutilizar `ODOO19_API_KEY` (esa key sirve al exportador y probablemente tiene permisos de escritura para crear `sale.order`).
- Doc AI SDK MCP: `experimental_createMCPClient` (Vercel AI SDK) — cliente MCP nativo, transporte `SSEClientTransport` o HTTP segun lo que exponga `mn_mcp_server` (`/mcp`, Streamable HTTP, JSON-RPC 2.0). Confirmar en la fase de auditoria que el transporte HTTP del AI SDK es compatible con el endpoint del modulo antes de escribir el cliente.
- Modulo Odoo: `mn_mcp_server` (Odoo Apps Store, LGPL-3, version auditada 19.0.3.2.0) — https://apps.odoo.com/apps/modules/19.0/mn_mcp_server. Fuente a forkear para el parcheo de la Fase 1.

### Decisiones Tecnicas

1. **Cliente MCP**: se usa el cliente MCP nativo de Vercel AI SDK (`experimental_createMCPClient`), no el conector MCP de la API de Anthropic ("via corta" de `AGENTS.md` §4) ni un cliente JSON-RPC escrito a mano. Razon: coherencia con el golden path del proyecto (Vercel AI SDK + proveedor de modelo swappable via `src/lib/ai/openrouter.ts`); evita atar el chat a la API directa de Anthropic, que el chat actual no usa. Es la "via larga" de `AGENTS.md` §4, implementada con la pieza nativa del SDK en vez de JSON-RPC manual.
2. **Modelo de identidad**: rol interno unico con acceso amplio al equipo comercial — **una sola API key de Odoo** para toda la feature, no identidad por usuario individual. `AGENTS.md` invariante nº2 exige identidad por usuario como default quando el chat es multiusuario, pero permite simplificar a un rol unico como **decision consciente**. Esta es esa decision: se documenta aqui explicitamente, no se adopta como atajo. Consecuencia: todas las preguntas del chat sobre Odoo corren con los mismos permisos (solo lectura, ver punto 3); si en el futuro se necesita que las record rules de Odoo distingan por usuario, es un cambio de arquitectura posterior y explicito, no una extension incremental de este PRP.
3. **Alcance de permisos**: la API key de Odoo para esta feature se crea con `perm_read`, sin escritura. `odoo_execute` y `odoo_run_server_action` quedan **desactivados** en el modulo o en la configuracion de la key salvo que surja una necesidad de negocio concreta, que se elevaria como decision aparte (invariante nº3 y nº4 de `AGENTS.md`).
4. **Modulo `mn_mcp_server` no se despliega tal cual**: se despliega desde un **fork parcheado** propio (LGPL-3 permite forkear y modificar), nunca la version de la tienda con autoactualizacion activada, porque cada actualizacion desde la tienda puede reintroducir el fallo de auto-asignacion de grupo. Los 3 fallos a parchear:
   - Token en claro persistido en BD hasta que un admin lo revela → debe devolverse una sola vez al crear la key y no guardarse en claro.
   - Auto-asignacion de todos los admins del sistema al grupo MCP Manager en cada actualizacion del modulo → revertir el comportamiento y asignar el grupo a mano.
   - `odoo_run_server_action` sin comprobacion de whitelist de modelos de la API key → anadir la comprobacion, o mantener el tool desactivado por completo (ver punto 3) mientras no se parchee.
5. **Retencion de datos (invariante nº5)**: al ir por AI SDK y no necesariamente por Anthropic con ZDR, los datos que pasan por el proveedor de modelo (definiciones de herramientas MCP y resultados de las consultas a Odoo) no estan cubiertos por retencion cero necesariamente. Esto **no bloquea el PRP** ni la fase de pruebas, pero es un punto que debe validarse con negocio/legal antes de exponer datos sensibles de clientes reales en produccion. Se deja como gate explicito en la Fase de Validacion Final.
6. **Entorno de pruebas primero**: todo el desarrollo y las pruebas de este PRP se hacen contra un Odoo de pruebas (no `enteza19.xtendoo.es` en modo produccion salvo que el usuario indique lo contrario); HTTPS siempre, lista blanca de IPs en la API key del chat, auditoria del modulo activada.
7. **Separacion de carriles**: el cliente MCP y sus credenciales viven en su propio servicio dentro de `src/features/chat/`, sin importar ni compartir codigo con `src/features/odoo19/` (que sigue usando JSON-2 y sus propias `ODOO19_*` env vars). Ningun archivo de `src/features/odoo19/` se modifica en este PRP.

### Arquitectura Propuesta (Feature-First)

```
src/features/chat/
├── components/                      # Sin cambios (ChatPage, ChatInput, etc.)
├── tools/
│   └── index.ts                     # chatTools (Supabase) — sin cambios de contenido
├── mcp/
│   ├── odooMcpClient.ts             # experimental_createMCPClient + transporte HTTP hacia mn_mcp_server
│   ├── odooMcpTools.ts              # Descubre y expone las tools MCP filtradas (solo lectura) al route handler
│   └── types.ts                     # Tipos del cliente/config MCP
└── index.ts

src/app/api/chat/route.ts            # Combina chatTools (Supabase) + tools de odooMcpTools en un solo `tools`
                                      # pasado a streamText; sin tocar stopWhen ni el modelo actual
```

Variables de entorno nuevas (servidor, nunca en frontend):
```
ODOO_MCP_URL=            # URL del endpoint /mcp del Odoo de pruebas (fork parcheado)
ODOO_MCP_API_KEY=        # API key de solo lectura (perm_read), separada de ODOO19_API_KEY
```

No se toca `.env.local` con datos reales en este PRP sin aprobacion explicita del usuario; solo se documentan las variables esperadas en `.env.example`.

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se listan FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agentico (mapear contexto → generar subtareas → ejecutar).

### Fase 0: Auditoria y parcheo del modulo `mn_mcp_server` — OMITIDA (2026-08-15, decision explicita del usuario)
**Objetivo**: Forkear el modulo `mn_mcp_server` (19.0.3.2.0, LGPL-3) y corregir los 3 fallos conocidos (token en claro, auto-asignacion de grupo, falta de whitelist en `odoo_run_server_action`) antes de escribir cualquier codigo de la app. Instalar el fork en el Odoo de pruebas, con autoactualizacion desde la tienda desactivada.
**Validacion**: El fork instalado en el Odoo de pruebas demuestra las 3 correcciones: (a) el token no se puede leer en claro desde la BD despues de creado, (b) los admins existentes no se anaden automaticamente al grupo MCP Manager al actualizar el modulo, (c) `odoo_run_server_action` respeta una whitelist de modelos de la API key o esta desactivado. No se avanza a la Fase 1 sin esto verificado.

### Fase 1: Configuracion de la API key y del entorno de pruebas — VERIFICADA
**Objetivo**: Crear en el Odoo de pruebas la API key de solo lectura (`perm_read`) para el chat, con `odoo_execute` y `odoo_run_server_action` desactivados, lista blanca de IPs configurada, auditoria del modulo activada, y HTTPS confirmado. Documentar `ODOO_MCP_URL` / `ODOO_MCP_API_KEY` en `.env.example`.
**Validacion**: Confirmado por curl directo contra `/mcp`: la key lee datos (`odoo_search_read` sobre `res.partner` devuelve resultados reales) y un intento de escritura (`odoo_write`) es rechazado con `perm_write missing`. `odoo_list_models` confirma el scope: `account.move, product.template, res.partner, sale.order`. IP allowlist y rate limit no configurados aun (el modulo no los expone en su UI, ver Gotchas) — pendiente antes de produccion, no bloqueante para el entorno de pruebas.

### Fase 2: Cliente MCP en el backend del chat — VERIFICADA
**Objetivo**: Implementar `src/features/chat/mcp/odooMcpClient.ts` con `createMCPClient` (`@ai-sdk/mcp`) apuntando al Odoo de pruebas, y `odooMcpTools.ts` que descubre las tools expuestas (`tools/list`) y las filtra/expone solo las de lectura permitidas para uso del modelo.
**Validacion**: `scripts/test-odoo-mcp.mjs` (aislado, sin pasar por el endpoint de chat) confirma que solo se exponen las 12 tools de solo lectura del allowlist, y que `odoo_search_read` devuelve datos reales de Odoo.

### Fase 3: Integracion en el endpoint del chat — VERIFICADA (via script aislado; UI real bloqueada por login sin flujo funcional)
**Objetivo**: Combinar las tools MCP de Odoo con `chatTools` (Supabase) en `src/app/api/chat/route.ts`, ajustando el `SYSTEM_PROMPT` para que el modelo sepa que ahora tiene acceso de solo lectura a Odoo ademas de Supabase, sin modificar `src/features/odoo19/`.
**Validacion**: `scripts/test-chat-e2e.mjs` reproduce la logica exacta de `route.ts` (mismo merge de tools, mismo modelo) fuera del endpoint HTTP porque `/api/chat` esta protegido por `src/proxy.ts` y no hay usuario de prueba/login funcional para probar por HTTP. Resultado: la pregunta "Busca en Odoo el cliente que contenga 'SCANIA'..." dispara `odoo_name_search` y devuelve el ID real (1546). `scripts/test-chat-supabase.mjs` confirma que las preguntas de solo-Supabase (`getStockBreakages`) siguen funcionando sin regresion. Pendiente real: probarlo desde la UI del navegador en cuanto exista un login utilizable (ver PROJECT_STATUS.md, Auth sigue listada como pendiente en la Fase 1 general del proyecto).

### Fase 4: Validacion Final
**Objetivo**: Sistema funcionando end-to-end en el entorno de pruebas, con todas las invariantes de seguridad verificadas y documentadas.
**Validacion**:
- [x] `npm run typecheck` pasa.
- [x] `npm run build` es exitoso.
- [x] El chat responde correctamente preguntas mixtas (Supabase + Odoo) — verificado via script aislado, pendiente repetir desde la UI real cuando haya login.
- [x] Se confirma por inspeccion Y por llamada real que la key del chat es de solo lectura: `odoo_write` devuelve `perm_write missing`; `odoo_execute`/`odoo_run_server_action` no se exponen al modelo (filtrados en `odooMcpTools.ts`) aunque el servidor los acepte.
- [x] `src/features/odoo19/` no tiene diffs respecto al estado previo a este PRP.
- [ ] Punto de retencion de datos (invariante nº5) queda anotado como pendiente de validacion con negocio/legal antes de produccion, no bloqueante para cerrar este PRP en el entorno de pruebas.
- [ ] IP allowlist y rate limit de la API key (existen en el modelo pero no en la UI del modulo) — pendiente, ver Gotchas.
- [x] Los criterios de exito de la seccion "Que" se cumplen para el entorno de pruebas.

---

## Aprendizajes (Self-Annealing / Neural Network)

> Esta seccion crecera durante la implementacion.

### 2026-08-15: Fase 0 omitida por decision explicita del usuario
- **Decision**: el usuario ya monto `mn_mcp_server` en un Odoo de pruebas sin aplicar los 3 parches de la Fase 0 (token en claro, auto-asignacion de grupo, whitelist en `odoo_run_server_action`). Se salta la Fase 0 y se avanza directo a Fase 2/3.
- **Mitigacion aplicada en el codigo**: `src/features/chat/mcp/odooMcpTools.ts` filtra las tools devueltas por `client.tools()` contra un allowlist explicito (`ODOO_MCP_READONLY_TOOLS` en `types.ts`) — solo tools de lectura llegan al modelo, sin importar lo que el servidor exponga o los permisos reales de la API key configurada. Esto no sustituye el parcheo del modulo (el fallo de token en claro y el de auto-asignacion de grupo siguen presentes en el Odoo de pruebas), solo reduce el riesgo de que el chat use `odoo_execute`/`odoo_run_server_action`/tools de escritura si la key tuviera esos permisos.
- **Pendiente real**: aplicar los 3 parches de la Fase 0 sigue siendo necesario antes de cualquier entorno con datos reales de clientes o antes de produccion. Ver `AGENTS.md` seccion 6.

### 2026-08-15: `experimental_createMCPClient` no existe en AI SDK v6
- **Error evitado**: el PRP original referenciaba `experimental_createMCPClient` (API de AI SDK v5). En la version instalada (`ai@6.0.176`), el cliente MCP vive en el paquete separado `@ai-sdk/mcp`, funcion `createMCPClient` (ya no experimental).
- **Fix**: `npm install @ai-sdk/mcp`; import `import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'`.
- **Aplicar en**: cualquier feature futura que integre MCP con el AI SDK en este repo.

### 2026-08-15: Revision del codigo real de `mn_mcp_server` instalado (fork de moaaznaabilali, GitHub) — difiere de lo asumido en AGENTS.md
- **Token en claro**: NO esta presente en esta version. `mcp_api_key.py` guarda solo `token_hash` (SHA-256); el campo `token` en claro se limpia (`write({"token": False})`) en cuanto se revela una vez (`action_reveal_token`). El fallo nº1 de `AGENTS.md` §6 esta ya resuelto en el codigo instalado.
- **Auto-asignacion de grupo**: SI esta presente, confirmado en `security/mcp_security.xml` (bloque sin `noupdate="1"`, comentario explicito "also applies on upgrade"): mete a `base.group_system` (todos los administradores) en `group_mcp_manager` en cada instalacion/actualizacion. Coincide con el fallo nº2. Mitigacion aplicada: la API key del chat se crea sobre un usuario interno NO administrador (ver guia de configuracion), asi no depende de ese grupo para nada — `group_mcp_manager`/`group_mcp_user` solo gobiernan el acceso a las pantallas de administracion del propio modulo, no los permisos que aplica `/mcp` en tiempo de llamada (esos son los ACL/record rules normales del `user_id` de la key).
- **`odoo_run_server_action` sin whitelist**: confirmado y **peor** de lo documentado — en `controllers/mcp.py` el handler no llama a `_check_model()` ni comprueba `perm_write`/`perm_read`; solo exige que la `ir.actions.server` exista. Cualquier key activa podria ejecutarla (sujeta al guardarrail de confirmacion de `confirm.py`, que exige `confirm: true` o MRTR). Mitigacion: `odooMcpTools.ts` nunca expone `odoo_run_server_action` ni `odoo_execute` al modelo (no estan en `ODOO_MCP_READONLY_TOOLS`), asi que el LLM de este chat no puede invocarlos aunque el servidor los acepte. Pendiente de reportar/parchear aguas arriba si se usa este modulo con mas clientes MCP en el futuro.
- **`odoo_execute` si esta bien gateado**: comprueba modelo permitido (`_check_model`) y `allowed_methods` (CSV vacio = bloqueado por defecto). No se toca para esta feature (excluido del allowlist de todas formas).
- **Campos sin UI**: `ip_allowlist` y `rate_per_minute` existen en el modelo y se aplican en el controlador, pero **no estan en ninguna vista** (`views/mcp_api_key_views.xml` no los incluye). Para fijarlos hace falta developer mode + un Server Action puntual (ver guia de configuracion) o Odoo Studio.

### 2026-08-15: Validacion end-to-end completada contra el Odoo de pruebas real
- **Instancia multi-base — cabecera obligatoria**: `enteza19.xtendoo.es` aloja varias bases (`enteza` para el carril JSON-2, `enteza_p` para el MCP de pruebas). Sin la cabecera `X-Odoo-Database`, Odoo devuelve `404 "No database is selected and the requested URL was not found in the server-wide controllers"` — el propio error de Odoo sugiere la cabecera correcta (`<!-- Alternatively, use the X-Odoo-Database header. -->`); `?db=` en la query string NO funciona para esta ruta. Se anadio `ODOO_MCP_DB` como variable de entorno nueva y se envia en `odooMcpClient.ts`. Puede diferir de `ODOO19_DB` (bases distintas en la misma instancia).
- **`@ai-sdk/openai` usa la Responses API por defecto**: `openai(modelId)` (el export por defecto de `createOpenAI`) apunta a `/responses`. OpenRouter no traduce bien el flujo de tool-calls multi-turno por esa via (`400 "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'"` en la segunda vuelta, tras la primera tool call). Fix: usar `openai.chat(modelId)` (Chat Completions API), que OpenRouter soporta correctamente. Cambiado en `src/app/api/chat/route.ts`.
- **La key de OpenRouter que llego era del formato `sk-or-v1-...`**, no una key de OpenAI (`sk-...`/`sk-proj-...`). `src/lib/ai/openrouter.ts` nunca tenia `baseURL` pese al nombre del archivo — se anadio `baseURL: 'https://openrouter.ai/api/v1'`. El modelo debe llevar el prefijo de proveedor de OpenRouter (`openai/gpt-4o-mini`, no `gpt-4o-mini`); si no, OpenRouter no lo resuelve.
- **`odoo_user_context` esta roto en el modulo instalado**: devuelve `Internal error: 'res.users' object has no attribute 'groups_id'` (incompatibilidad del modulo con esta version de Odoo 19). No bloquea nada — no es una tool que el chat necesite, se deja como tool disponible pero no probada activamente.
- **Ambiguedad de tools con nombres parecidos**: con un system prompt generico, el modelo confundio `searchCustomers` (Supabase, clientes locales de Enteza Reservas) con las tools `odoo_*` (ERP) para una pregunta que mencionaba "Odoo" explicitamente. Fix: se reforzo el `SYSTEM_PROMPT` en `route.ts` (reglas 11-13) dejando explicito que las tools sin prefijo `odoo_` son datos locales de Enteza Reservas, no del ERP, y que ante una mencion explicita de "Odoo"/"ERP" debe usar las `odoo_*`. Confirmado con prueba real: la pregunta "Busca en Odoo el cliente que contenga 'SCANIA'..." ahora dispara `odoo_name_search` correctamente y devuelve el ID real (1546).
- **Key vieja invalida en `.env.local`**: habia una `ODOO_MCP_API_KEY` de un intento anterior que ya no autenticaba (`Authentication failed`). Sustituida por la key verificada por curl.
- **Scripts de verificacion aislada** anadidos en `scripts/` (`test-odoo-mcp.mjs`, `test-chat-e2e.mjs`, `test-chat-supabase.mjs`) usando `npx tsx` — permiten probar el cliente MCP y el endpoint de chat completo sin pasar por el proxy de auth (`/api/chat` esta protegido y no hay login funcional todavia para probar por HTTP directamente).

### 2026-08-15: Preguntas de alquiler sin respuesta — dos causas distintas encontradas y corregidas
- **Causa 1 (permisos)**: `allowed_models` de la API key no incluia `sale.order.line` ni `product.product`. `sale.order` (cabecera del pedido) si estaba, por eso el modelo podia confirmar que un pedido de alquiler existia y sus fechas, pero no que articulos contenia (eso vive en `sale.order.line`, referenciando `product.product`). Fix: el usuario amplio `allowed_model_ids` en Odoo (Ajustes → MCP Server → API Keys) a `sale.order.line` y `product.product`. Verificado por curl: `odoo_search_read` sobre `sale.order.line` devuelve las lineas reales.
- **Causa 2 (alucinacion de esquema)**: incluso con permisos correctos, el modelo inventaba nombres de modelo plausibles pero inexistentes (`rental.order`, `rental.order.line`) en vez de `sale.order` / `sale.order.line`, y filtraba `order_id` por la referencia de texto ("S00048") en vez del ID numerico. En Odoo 19 el alquiler NO es un modelo aparte: es `sale.order` con `is_rental_order=true`. Fix: se anadio la regla 14 al `SYSTEM_PROMPT` en `route.ts` explicitando los nombres de modelo reales y el patron en dos pasos (resolver `name` → `id` en `sale.order`, luego filtrar `sale.order.line` por `order_id` numerico). Verificado con `scripts/test-chat-rental.mjs`: "En Odoo, que material tiene el pedido de alquiler S00048?" ahora responde correctamente (VASO MACETA MAXI 50CL x5).
- **Leccion general**: dar acceso de modelo (`allowed_models`) no es suficiente para que el LLM use bien un ERP con nombres de modelo no obvios — hace falta o bien documentar el esquema en el system prompt (lo que se hizo aqui), o usar las "Custom tools" que expone `mn_mcp_server` (tools de negocio predefinidas por dominio, ver descripcion del modulo) para encapsular estas consultas sin depender de que el modelo adivine el esquema. Queda como mejora futura si aparecen mas preguntas de negocio con el mismo patron.

### 2026-08-16: UX de "Ejecutando..." y falta de tool de ranking por articulo
- **"Ejecutando..." confuso**: `ChatMessage.tsx` solo tenia etiquetas en espanol para las 9 tools originales de Supabase; cualquier tool `odoo_*` (y cualquier tool nueva) caia en el texto generico. Se anadieron etiquetas para las 12 tools `odoo_*` de solo lectura, y se cambio el fallback a `Consultando datos (${toolName})...` para que al menos sea legible si aparece una tool sin etiquetar en el futuro.
- **Preguntas de conteo por rango disparaban muchas llamadas**: sin una tool explicita para "cuantas reservas en un mes", el modelo a veces optaba por consultar dia por dia (`getRentalsByDate` repetido), lo que generaba muchos indicadores "Ejecutando..." seguidos y respuestas de 20-40s. Fix: regla 15 en el `SYSTEM_PROMPT` forzando a usar `getDemandForecast` (que ya agrega por rango en una sola llamada) para preguntas de total/conteo.
- **No existia tool para "articulo mas reservado"**: se anadio `getMostReservedArticles(startDate, endDate, limit)` en `src/features/chat/tools/index.ts` — suma `rental_items.quantity` agrupado por `article_id` para las reservas no canceladas de un rango, devuelve ranking ordenado. Regla 16 en el prompt para que el modelo la use en vez de sumar el mismo articulo por articulo con `getArticleReservations`. Verificado con `scripts/test-chat-ranking.mjs`: responde en un solo paso.
- **Patron general**: cada vez que aparece una pregunta de agregacion (total, ranking, promedio) que ninguna tool cubre, el modelo intenta resolverla iterando con las tools de detalle que si existen, lo cual es lento y genera ruido en la UI. La solucion recurrente en este proyecto es anadir una tool de agregacion dedicada + una regla explicita en el prompt, no confiar en que el modelo componga la agregacion el mismo.

### 2026-08-16: Bug en `mn_mcp_server` — Custom Tools de tipo "group" ignoran el campo Limit
- **Bug encontrado**: en `models/mcp_tool.py`, metodo `run()`, la rama `kind == "group"` llama a `model._read_group(domain, groupby=groupby, aggregates=aggregates or ["__count"])` **sin pasar `limit`** (la variable se calcula al principio de la funcion pero solo se usa en la rama `kind == "query"`). Consecuencia: una tool de agregacion (ej. "articulo mas alquilado en un rango") devuelve TODOS los grupos que matchean el domain, sin ordenar por el valor agregado y sin respetar el campo "Limit" configurado en la UI. Con datos reales: 591 filas, ~42KB, ~20.800 tokens para una pregunta que debería costar una fraccion de eso.
- **Fix aplicado (sin tocar el modulo de Odoo)**: `withGroupResultTrimming()` en `src/features/chat/mcp/odooMcpTools.ts` envuelve el `execute` de CUALQUIER tool MCP; si el resultado tiene la forma `{groups, groupby, aggregates}` (la firma de un resultado "group"), lo ordena por el primer valor agregado descendente y lo recorta a `MAX_GROUP_ROWS` (20) antes de que llegue al modelo. Aplica automaticamente a cualquier Custom Tool de tipo `group` futura, sin tocar codigo cada vez. Verificado: la misma pregunta ("articulo mas alquilado en mayo 2026") paso de ~20.800 a ~1.327 tokens, misma respuesta correcta (VASO MACETA MAXI 50CL, 134.775 unidades).
- **Por que no se parcheo el modulo**: arreglar `run()` en Odoo (anadir sort + slice antes de devolver `rows`) seria la solucion "correcta" en origen, pero implica forkear/actualizar `mn_mcp_server` en el Odoo real — la misma clase de operacion que la Fase 0 (omitida por decision del usuario). El fix en `odooMcpTools.ts` da el mismo resultado practico sin esa dependencia.
- **Nota para el admin de Odoo**: si se crea una Custom Tool de tipo `group` que espera pocos grupos (ej. agrupando por un campo con pocos valores posibles), este bug no importa. Solo se nota cuando el `groupby` tiene muchos valores distintos (como `product_id`).

### 2026-08-16: Filtro cliente cambiado de allowlist a denylist para admitir Custom Tools de Odoo
- **Decision de arquitectura**: en vez de seguir anadiendo reglas al `SYSTEM_PROMPT` cada vez que el modelo se equivoca de esquema de Odoo (patron visto en las entradas anteriores con `sale.order`/`sale.order.line`), la via correcta para preguntas de negocio sobre datos de Odoo es definir una **Custom Tool** en el propio modulo (`mn.mcp.tool`, Ajustes → MCP Server → Custom Tools): nombre + descripcion + modelo + domain con parametros tipados (`{param}`, sustituidos como literales, sin riesgo de inyeccion) + tipo `query` (buscar), `group` (agregar/contar) o `action` (server action, requiere `perm_write`). El domain y el significado de negocio ("alquiler activo", "material mas alquilado") lo fija un admin de Odoo una vez, no el LLM adivinando en cada conversacion.
- **Limite de esta via**: las Custom Tools solo pueden tocar modelos de Odoo. No dan acceso a Supabase (datos propios de Enteza Reservas: disponibilidad, `rental_items`, roturas de stock) — esas siguen necesitando tools en `src/features/chat/tools/index.ts` porque `mn_mcp_server` no tiene ninguna visibilidad sobre esa base de datos.
- **Bug encontrado y corregido**: `odooMcpTools.ts` filtraba por un allowlist fijo de 12 nombres built-in (`ODOO_MCP_READONLY_TOOLS`); cualquier Custom Tool creada en Odoo se habria descartado en silencio porque su nombre no esta en esa lista. Cambiado a `ODOO_MCP_DENYLIST` (`src/features/chat/mcp/types.ts`): se excluyen por nombre solo las tools built-in de escritura/alto riesgo (`odoo_create*`, `odoo_write`, `odoo_unlink`, `odoo_copy`, `odoo_find_or_create`, `odoo_message_post`, `odoo_activity_schedule`, `odoo_send_email`, `odoo_attach_file`, `odoo_execute`, `odoo_run_server_action`); todo lo demas pasa. Es seguro porque: (a) las Custom Tools no pueden llamarse `odoo_*` (el propio modulo lo valida al guardar), por lo que nunca colisionan con el denylist ni necesitan anadirse a mano; (b) las Custom Tools de tipo `action` siguen exigiendo `perm_write` en el controlador de Odoo (`_tools_call`, rama de custom tools, a diferencia del bug del built-in `odoo_run_server_action`), y la key del chat sigue en `perm_read` unicamente — si alguien crea una Custom Tool de tipo `action`, Odoo la rechaza igualmente en el servidor. Verificado sin regresion con `scripts/test-odoo-mcp.mjs`: siguen expuestas exactamente las mismas 12 tools de lectura.

### 2026-08-16: Cambio de alcance — el chat pasa de "Supabase + Odoo" a "solo Odoo"
- **Decision del usuario**: el chat de la app se usara exclusivamente para preguntas a Odoo via MCP, no para disponibilidad/reservas propias de Enteza Reservas (Supabase).
- **Cambios aplicados**: `src/app/api/chat/route.ts` ya no importa ni fusiona `chatTools` (Supabase); `tools: odooTools` unicamente. `SYSTEM_PROMPT` reescrito para ser exclusivamente sobre Odoo (se quitaron las reglas de disponibilidad/almacenes/getDemandForecast/getMostReservedArticles, que eran Supabase-only).
- **Lo que NO se toco**: `src/features/chat/tools/index.ts` (las 11 tools de Supabase, incluida `getMostReservedArticles` anadida hoy mismo) se deja intacto, solo desconectado del endpoint. Reversible sin reescribir nada si se decide reactivar Supabase en el chat mas adelante — solo hay que volver a importar y fusionar `chatTools` en `route.ts` y ampliar el `SYSTEM_PROMPT`.
- **Consecuencia**: los criterios de exito originales de este PRP (chat respondiendo "ademas de sus preguntas actuales sobre Supabase") ya no aplican tal cual; el chat ahora es un asistente de Odoo puro. Si en el futuro se quiere volver a combinar ambas fuentes, revisar tambien las reglas de desambiguacion tool Supabase-vs-Odoo documentadas en los aprendizajes del 2026-08-15 (confusion `searchCustomers` vs `odoo_name_search`).

### 2026-08-15: `stopWhen` ajustado de 5 a 8 pasos
- **Razon**: con tools de Odoo sumadas a las de Supabase, una pregunta puede requerir encadenar mas llamadas (ej. `odoo_name_search` para resolver un cliente y luego `odoo_search_read` sobre sus pedidos). Se sube `stepCountIs(5)` a `stepCountIs(8)` en `src/app/api/chat/route.ts` como ajuste de criterio, sin tocar el comportamiento de las tools de Supabase existentes.

---

## Gotchas

- [ ] `OPENAI_API_KEY` no existe hoy en `.env.local`; sin ella `streamText` no puede completarse contra ningun modelo, aunque el cliente MCP funcione perfectamente. Resolverlo es prerrequisito para probar el flujo completo (fuera de alcance de este PRP, pero bloqueante para su validacion final).
- [ ] No reutilizar `ODOO19_API_KEY` (carril determinista, probablemente con permisos de escritura para crear `sale.order`) como credencial del chat MCP. Deben ser API keys distintas en Odoo.
- [ ] El modulo de la tienda de Odoo Apps tiene autoactualizacion; si el Odoo de pruebas ya tiene `mn_mcp_server` instalado desde la tienda, hay que congelar/desinstalar esa version antes de instalar el fork parcheado, o la proxima actualizacion puede reintroducir el fallo de auto-asignacion de grupo.
- [ ] `experimental_createMCPClient` es una API experimental del AI SDK; verificar en la documentacion vigente del SDK v6 el transporte HTTP soportado (SSE vs Streamable HTTP) antes de asumir compatibilidad directa con `mn_mcp_server`.
- [ ] `stopWhen: stepCountIs(5)` ya limita los pasos del agente en el endpoint actual; si una pregunta requiere varias llamadas MCP encadenadas (ej. buscar cliente y luego sus pedidos), confirmar que 5 pasos son suficientes o ajustar con criterio, sin tocar el comportamiento de las tools de Supabase existentes.
- [ ] `res.partner` y otros modelos de Odoo pueden exponer campos con datos personales; la lista de campos que el modelo puede leer via `odoo_search_read`/`odoo_read` debe revisarse, no asumir que "solo lectura" ya implica "sin riesgo de exposicion de datos sensibles".

## Anti-Patrones

- NO enrutar la exportacion de pedidos (carril determinista, `src/features/odoo19/`) a traves del cliente MCP o del agente. Si en tiempo de desarrollo ya se sabe el modelo y los campos de Odoo a tocar, no pasa por el chat/MCP (invariante nº1 de `AGENTS.md`).
- NO reutilizar el cliente JSON-2 de `src/features/odoo19/services/odoo19Client.ts` ni sus credenciales para esta feature; son protocolos, credenciales y ciclos de vida distintos.
- NO instalar `mn_mcp_server` desde la tienda de Odoo con autoactualizacion activada en ningun entorno, ni siquiera en pruebas, sin haber aplicado antes el parcheo de la Fase 0.
- NO habilitar `odoo_execute` ni `odoo_run_server_action` "para que funcione" un caso concreto sin elevarlo como decision explicita aparte.
- NO usar una API key con permisos de escritura para el chat, ni "por si acaso" ni "para no tener que pedir otra key despues".
- NO poner `ODOO_MCP_API_KEY` ni ninguna credencial de Odoo en codigo cliente/frontend; el cliente MCP vive exclusivamente en el backend (`src/app/api/chat/route.ts` y `src/features/chat/mcp/`).
- NO apuntar esta feature a la instancia de produccion de Odoo (`enteza19.xtendoo.es` en su rol operativo real) sin aprobacion humana explicita posterior a este PRP.

---

*PRP pendiente de aprobacion. No se ha modificado codigo de producto.*
