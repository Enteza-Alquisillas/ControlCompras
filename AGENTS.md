# Contexto del proyecto para el agente programador

Este documento te da el conocimiento necesario para trabajar en esta aplicación
sin repetir errores de arquitectura ya descartados. Léelo entero antes de tocar
nada relacionado con la integración con Odoo o con el chat. Lo que aquí se marca
como **invariante** no se negocia sin una decisión humana explícita.

Hay huecos deliberados marcados con `⟨…⟩`: son datos del repositorio que debes
descubrir tú (lenguaje, framework, rutas, cómo se autentica hoy contra Odoo). No
los inventes; averígualos leyendo el código y, si no puedes, pregunta.

---

## 1. Qué es este sistema

Una aplicación externa que ya se conecta a Odoo para **exportar pedidos**
generados en un sistema de terceros. Se le ha añadido una **funcionalidad de
chat** para interrogar a Odoo en lenguaje natural. El trabajo en curso es dotar a
ese chat de una capa de IA conectándolo al servidor MCP que corre dentro de Odoo.

Odoo objetivo: **versión 19** (Community y Enterprise conviven en el
ecosistema del cliente, pero la integración MCP es solo para la 19).

---

## 2. Arquitectura: dos carriles que nunca se cruzan

El sistema tiene dos tipos de tráfico hacia Odoo, con naturaleza opuesta. La
distinción es la decisión de diseño más importante del proyecto.

### Carril determinista — exportación de pedidos
En tiempo de desarrollo ya sabes el modelo y los campos que tocas. No hay
ambigüedad. Va por la **API directa de Odoo**, sin ningún LLM de por medio.
Latencia baja, coste cero, resultado predecible.

### Carril conversacional — chat
No sabes de antemano qué modelo hay que consultar ni con qué dominio; lo decide
un modelo de lenguaje. Va por la **capa de agente + MCP**.

### Invariante nº 1 — no cruzar los carriles
**Nunca** enrutes la exportación de pedidos ni ninguna operación ya conocida a
través del agente. Meter un LLM donde ya sabes el modelo y los campos solo añade
segundos de latencia, coste por llamada y la posibilidad de que el modelo se
equivoque de dominio, a cambio de nada.

Regla práctica: **si en tiempo de desarrollo ya sabes el modelo y los campos, no
pasa por el agente.**

```
                 ┌─────────────────────────┐
   exportación → │  API directa de Odoo     │ → Odoo 19 (ORM)
   (determinista)│  (JSON-2, ver §5)        │
                 └─────────────────────────┘
                 ┌─────────────────────────┐
   chat        → │  capa de agente + MCP    │ → Odoo 19 (ORM)
   (abierto)     │  (ver §4)                │
                 └─────────────────────────┘
```

---

## 3. El lado Odoo: el servidor MCP

El conocimiento del ERP se expone mediante un **módulo MCP instalado dentro de
Odoo 19**: `mn_mcp_server` (Odoo Apps Store, licencia LGPL-3). Expone un endpoint
`/mcp` que habla **JSON-RPC 2.0 sobre HTTP (Streamable HTTP)** y autentica por
**Bearer token**.

Concepto clave: **el MCP no da inteligencia; expone herramientas.** La
inteligencia la pone un modelo que decide qué herramienta llamar. El MCP es el
brazo; el cerebro (el LLM) va aparte. Nuestra app no es un LLM, así que la pieza
que conecta ambos es lo que se describe en §4.

### Herramientas que expone el módulo
Lectura: `odoo_search`, `odoo_search_count`, `odoo_read`, `odoo_search_read`,
`odoo_read_group`, `odoo_name_search`, `odoo_fields_get`, `odoo_list_models`,
`odoo_get_view`, `odoo_menu_tree`, `odoo_user_context`, `odoo_print_report`.

Escritura / acción: `odoo_create`, `odoo_create_many`, `odoo_write`,
`odoo_unlink`, `odoo_copy`, `odoo_find_or_create`, `odoo_message_post`,
`odoo_activity_schedule`, `odoo_send_email`, `odoo_attach_file`,
`odoo_execute`, `odoo_run_server_action`.

También admite **herramientas propias** (custom tools) definidas desde la UI de
Odoo, que envuelven un dominio parametrizado o una acción de servidor. Son la vía
recomendada para encapsular conceptos de negocio ("pedidos pendientes de
entrega", "material no devuelto") en lugar de que el modelo los improvise.

### Modelo de autenticación
Cada API key equivale a **un usuario de Odoo**: la llamada corre con sus permisos
y sus record rules. El módulo también implementa un servidor OAuth 2.1 (PKCE
S256, tokens ligados a audiencia) para no tener que repartir tokens a mano.

---

## 4. Cómo conecta el chat con el MCP (la capa de IA)

Dos vías. Empieza por la corta; pásate a la larga solo si topas con sus límites.

### Vía corta (por defecto): conector MCP de la API de Anthropic
La API de Mensajes de Anthropic puede actuar ella misma como cliente MCP. Le
pasas la URL de `/mcp` en `mcp_servers` y la API descubre las herramientas,
decide cuáles llamar, las ejecuta contra Odoo y devuelve la respuesta redactada.
No escribes el bucle de agente ni la traducción de herramientas.

```python
client.beta.messages.create(
    model="claude-opus-4-8",          # o el modelo que decida el equipo
    max_tokens=1024,
    messages=[{"role": "user", "content": pregunta_del_usuario}],
    mcp_servers=[{
        "type": "url",
        "url": "https://⟨tu-odoo⟩/mcp",
        "name": "odoo",
        "authorization_token": token_bearer_del_usuario,   # ver invariante nº 2
    }],
    betas=["mcp-client-2025-11-20"],   # cabecera beta requerida
)
```

Límites que debes verificar contra la doc antes de comprometerte
(https://docs.claude.com/en/docs/agents-and-tools/mcp-connector):
- Solo soporta **llamadas a herramientas**; no expone recursos ni prompts del
  MCP. Para interrogar datos no los necesitas.
- El servidor MCP debe ser **accesible por HTTPS público** desde los rangos de IP
  de Anthropic. Un Odoo en localhost o solo en VPN **no** funciona por esta vía.

### Vía larga: cliente MCP propio en el backend
Si el Odoo no estará en HTTPS público, o quieres control del bucle (caché,
orquestación, mezclar herramientas propias, cambiar de proveedor de modelo),
escribe el cliente MCP en el backend: hablas JSON-RPC 2.0 contra `/mcp`, pides
`tools/list`, traduces al formato de tool-use del modelo, y en bucle ejecutas
`tools/call` con los resultados hasta que el modelo redacta la respuesta. Es lo
mismo que hace la vía corta, pero bajo tu control.

---

## 5. El carril directo en Odoo 19: usa JSON-2, no XML-RPC

Para la exportación de pedidos y cualquier tráfico determinista, en Odoo 19 el
protocolo correcto es **JSON-2** (`POST /json/2/<modelo>/<método>`, cabecera
`Authorization` con la API key, cabecera propia para seleccionar base de datos).

XML-RPC y JSON-RPC están **deprecados** en la 19. La documentación oficial de la
19 sitúa su eliminación en Odoo 22 (y en Online 21.1), pero esa fecha se ha
movido más de una vez: **confírmala contra la doc de la versión que despliegues**
antes de asumir plazos. La dirección es estable aunque la fecha no lo sea.

Si el carril de exportación actual usa XML-RPC, plantéalo para migración, pero no
lo mezcles con el trabajo del chat: son cambios independientes.

---

## 6. Invariantes de seguridad

Este sistema mueve datos de clientes y pedidos de una empresa. Las siguientes
reglas pesan más que cualquier funcionalidad.

### Invariante nº 2 — identidad por usuario, nunca token de servicio compartido
Si el chat es multiusuario y usas una sola API key de servicio, todas las
preguntas corren con los mismos permisos y las record rules dejan de proteger:
alguien vería por el chat lo que no vería en la interfaz. Cada pregunta debe
correr como **el usuario real que la formula**, vía un token por usuario o vía el
OAuth del módulo. Si el chat es de un solo rol interno con acceso amplio, puede
simplificarse, pero es una decisión consciente, no el camino por defecto.

### Invariante nº 3 — el chat empieza en solo lectura
Crea la clave del chat con `perm_read` y **sin** escritura. Interrogar a Odoo no
necesita crear ni borrar nada, y así se elimina de raíz el riesgo de que el
modelo modifique datos por una instrucción ambigua. Subir a escritura es una
decisión posterior y explícita, con el guardarraíl de confirmación del módulo
activado.

### Invariante nº 4 — no habilitar herramientas potentes sin necesidad
`odoo_execute` (llamar métodos arbitrarios) y `odoo_run_server_action` (ejecutar
acciones de servidor, que pueden contener Python arbitrario) son superficies de
riesgo alto. Déjalas desactivadas salvo necesidad real y justificada.

### Fallos conocidos del módulo `mn_mcp_server` (versión auditada 19.0.3.2.0)
El módulo tiene buena base (identidad correcta, inyección de dominio prevenida,
OAuth sólido, guardarraíl de confirmación bien diseñado), pero **no está listo
para producción tal cual**. Antes de desplegar hay que parchear, forkeando la
copia LGPL-3:
1. **Token en claro persistido**: la clave se guarda en claro en la base de datos
   hasta que un admin pulsa "revelar". Debe devolverse una sola vez en la
   creación y no escribirse nunca en claro.
2. **Asignación automática de grupo**: la instalación mete a todos los
   administradores del sistema en el grupo MCP Manager, y lo reaplica en cada
   actualización. Revertir y asignar a mano.
3. **`odoo_run_server_action` sin whitelist de modelos**: ejecuta acciones de
   servidor sin comprobar la lista de modelos permitidos de la clave. Añadir la
   comprobación o desactivar el tool.

Consecuencia operativa: **despliega desde un fork parcheado, no instales y dejes
autoactualizar** — cada actualización desde la tienda puede reintroducir el fallo
nº 2. Controla tú cuándo subes de versión.

### Invariante nº 5 — privacidad del dato
Por la vía corta (§4), las definiciones de herramientas y los resultados de las
consultas pasan por la API de Anthropic, que **no** está cubierta por acuerdos de
retención cero de datos (ZDR): se retienen según su política estándar. Si se van
a exponer datos sensibles de clientes, debe validarse con la parte legal antes de
producción.

### Base operativa mínima
HTTPS siempre. Lista blanca de IPs en la clave del chat. Auditoría del módulo
activada. Empezar con datos de un entorno de pruebas antes de apuntar a
producción.

---

## 7. Cómo trabajar en este repositorio

- **Descubre el stack, no lo asumas.** Lenguaje, framework, gestor de
  dependencias, cómo se autentica hoy contra Odoo, si el Odoo está en HTTPS
  público: todo eso está en el código. Léelo. `⟨rellena aquí lo que averigües
  para el siguiente agente⟩`.
- **Separa los dos carriles en el código.** El módulo/servicio de exportación y
  el del chat no comparten cliente HTTP hacia Odoo: distinto protocolo (JSON-2 vs
  MCP), distinta credencial, distinto ciclo de vida.
- **El endpoint de chat del backend** debería: recibir la pregunta, resolver el
  token del usuario (invariante nº 2), llamar a la API con el conector MCP,
  devolver la respuesta. No pongas la clave del LLM ni el token de Odoo en el
  frontend.
- **Prueba el chat contra el modelo de datos real** (custom models incluidos y
  agregaciones) en un entorno de pruebas antes de darlo por bueno. El
  comportamiento del agente depende mucho de cómo esté modelado el negocio.
- **No amplíes permisos ni actives herramientas de escritura/acción** para
  "que funcione" un caso concreto. Si un caso los necesita, elévalo como decisión,
  no como atajo.

---

## 8. Referencias

- Conector MCP de la API: https://docs.claude.com/en/docs/agents-and-tools/mcp-connector
- API de Mensajes de Anthropic: https://docs.claude.com/en/api/overview
- API externa de Odoo 19 (JSON-2): https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
- Módulo MCP: https://apps.odoo.com/apps/modules/19.0/mn_mcp_server

---

## 9. Modelos disponibles (strings de la API, a fecha de redacción)

`claude-opus-4-8` · `claude-sonnet-5` · `claude-haiku-4-5` · `claude-fable-5`.
Elige según el equilibrio coste/latencia/capacidad que decida el equipo; verifica
la lista vigente en la doc antes de fijar uno, porque cambia.

---

*Este documento refleja las decisiones de arquitectura acordadas hasta su
redacción. Cuando tomes una decisión que lo contradiga o lo complete,
actualízalo: es la memoria del proyecto para el siguiente agente.*
