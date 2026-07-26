# Checklist de entrega y preparación de demo

## Requisitos previos

- [ ] Node.js 22+ instalado
- [ ] npm 10+ instalado
- [ ] Navegador moderno (Chrome, Firefox o Edge)
- [ ] Acceso a internet para la demo en producción
- [ ] Archivos CSV de demo disponibles en `demo/`

## Verificación pre-demo (comprobaciones técnicas)

- [ ] La URL de producción responde: https://main.d15yyirx1kaofe.amplifyapp.com
- [ ] Cargar cualquier CSV y verificar que aparece el badge "Modo IA · Explicaciones enriquecidas"
- [ ] Si aparece "Modo local · Reglas", revisar CloudWatch para confirmar si Lambda/Mantle responde
- [ ] Tener preparados los tres archivos: `demo/riesgo-bajo.csv`, `demo/riesgo-medio.csv`, `demo/riesgo-alto.csv`
- [ ] Verificar que los archivos CSV se abren correctamente en un editor de texto (codificación UTF-8)

## Instalación y arranque local (respaldo)

```bash
npm install
npm run dev
```

- [ ] La aplicación inicia en http://localhost:5173
- [ ] Se muestra el encabezado "Pipeline Risk Auditor"
- [ ] En modo local, aparece el badge "Modo local · Reglas"

## Estado inicial de la aplicación

- [ ] Se muestra la zona de carga de archivos (drag-and-drop)
- [ ] No hay errores en la consola del navegador
- [ ] No se muestra ningún resultado ni hallazgo previo

---

## Demo: caso 1 — Riesgo bajo

### Cargar `demo/riesgo-bajo.csv`

- [ ] Arrastrar o seleccionar el archivo
- [ ] El análisis se ejecuta sin errores

### Resultado esperado

- [ ] Puntaje: **0/100**
- [ ] 0 hallazgos detectados
- [ ] Candidatas heurísticas: `id` (clave primaria) y `fecha_actualizacion` (marcador incremental)
- [ ] Resumen de estructura: 20 filas, 5 columnas
- [ ] Si hay IA disponible: resumen ejecutivo indica riesgo bajo

### Explicación para el presentador

> "Este archivo representa datos limpios y bien estructurados. El motor no detecta problemas. Las heurísticas identifican correctamente la columna id como clave primaria y fecha_actualizacion como marcador de carga incremental."

### Reinicio

- [ ] Hacer clic en "Analizar otro archivo" antes de cargar el siguiente CSV

---

## Demo: caso 2 — Riesgo medio

### Cargar `demo/riesgo-medio.csv`

- [ ] Arrastrar o seleccionar el archivo
- [ ] El análisis se ejecuta sin errores

### Resultado esperado

- [ ] Puntaje: **30/100**
- [ ] 3 hallazgos detectados, todos con severidad "medio":
  - [ ] `empties-correo`: 2 vacíos (10%)
  - [ ] `empties-departamento`: 2 vacíos (10%)
  - [ ] `duplicates-exact`: 1 fila duplicada (5%)
- [ ] Fechas en formatos mixtos (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) son reconocidas como válidas
- [ ] 2024-02-29 y 2024-04-30 son fechas válidas, no generan hallazgo
- [ ] Candidata heurística: `fecha_actualizacion` (marcador incremental)
- [ ] Si hay IA: explicaciones contextuales para cada hallazgo

### Explicación para el presentador

> "Este archivo tiene problemas moderados: algunos campos vacíos y una fila duplicada. Las fechas usan formatos distintos pero son todas válidas. El motor clasifica correctamente estos problemas como severidad media."

### Reinicio

- [ ] Hacer clic en "Analizar otro archivo" antes de cargar el siguiente CSV

---

## Demo: caso 3 — Riesgo alto

### Cargar `demo/riesgo-alto.csv`

- [ ] Arrastrar o seleccionar el archivo
- [ ] El análisis se ejecuta sin errores

### Resultado esperado

- [ ] Puntaje: **60/100**
- [ ] 3 hallazgos detectados, todos con severidad "alto":
  - [ ] `empties-correo`: 5 vacíos (25%)
  - [ ] `empties-departamento`: 7 vacíos (35%)
  - [ ] `duplicates-exact`: 5 filas duplicadas (25%)
- [ ] No se detecta columna temporal (la columna se llama "registro", no coincide con patrones temporales)
- [ ] No se identifica clave primaria (id no es único: valor "1" repetido 6 veces)
- [ ] Sin candidatas heurísticas
- [ ] Si hay IA: resumen ejecutivo advierte sobre riesgo elevado

### Explicación para el presentador

> "Este archivo presenta problemas graves: alta proporción de campos vacíos, muchos duplicados exactos y sin una columna temporal ni una clave primaria identificable. El motor no encuentra candidatas heurísticas. El puntaje de 60 indica que estos datos no deberían ingresarse sin corrección previa."

---

## Funcionalidades adicionales a mostrar

- [ ] Badge "IA" o "Reglas" según la disponibilidad del servicio
- [ ] Resumen ejecutivo generado por Bedrock Mantle (si está disponible)
- [ ] Confirmar/rechazar una columna candidata (en el caso de riesgo bajo o medio)
- [ ] Exportar reporte en Markdown con el botón de descarga
- [ ] Mostrar que el reporte descargado contiene hallazgos, puntaje y candidatas

## Notas para video de presentación

1. Mostrar la pantalla inicial limpia
2. Cargar `riesgo-bajo.csv` → explicar que no hay riesgos
3. Cargar `riesgo-medio.csv` → mostrar hallazgos de severidad media
4. Cargar `riesgo-alto.csv` → mostrar hallazgos de severidad alta y ausencia de candidatas
5. Confirmar una candidata heurística (en el caso medio)
6. Exportar el reporte Markdown
7. Mencionar brevemente: "El análisis determinístico se ejecuta en el navegador. Solo el resumen se envía al backend para explicaciones de IA."
8. Si durante la demostración el servicio de IA entra en modo degradado, mostrar que la aplicación continúa funcionando

## Plan de contingencia

### Si la URL de producción no responde

- [ ] Ejecutar localmente: `npm run dev`
- [ ] El motor determinístico funciona completamente sin conexión
- [ ] Las explicaciones serán basadas en reglas (modo degradado)

### Si el servicio de IA no responde (timeout o error)

- [ ] La app activa automáticamente el modo degradado
- [ ] Se muestra el banner: "Modo degradado: el servicio de IA no está disponible"
- [ ] Las explicaciones basadas en reglas están disponibles
- [ ] El puntaje, hallazgos y candidatas no se afectan (son locales)

### Si un CSV no carga correctamente

- [ ] Verificar que el archivo tiene codificación UTF-8
- [ ] Verificar que la extensión es .csv
- [ ] Verificar que el tamaño no excede 10 MB
- [ ] Crear un CSV simple de prueba con 3-5 filas como respaldo

### Si los puntajes no coinciden con lo esperado

- [ ] Ejecutar `npm run test:run` para verificar que los tests pasan
- [ ] Los puntajes dependen de la fórmula: (alto×20) + (medio×10) + (bajo×5), limitado a 100
- [ ] Verificar que el archivo CSV no se modificó accidentalmente

## Cierre de la demostración

- [ ] Resumir los tres niveles de riesgo mostrados
- [ ] Mencionar que el proyecto se desarrolló con Kiro usando spec-driven development
- [ ] Referenciar `.kiro/specs/pipeline-risk-auditor/` como evidencia del proceso
- [ ] Agradecer y abrir a preguntas
