# Implementation Plan: Pipeline Risk Auditor

## Overview

Implementación secuencial en 7 fases del MVP de Pipeline Risk Auditor. Cada fase se completa antes de iniciar la siguiente. El sistema funciona completamente en modo local (reglas determinísticas) antes de integrar AWS. La integración con AWS (Bedrock, Lambda, Amplify) se aborda solo después de que el MVP local esté funcional y probado.

## Tasks

- [ ] 1. FASE 1 — Base local
  - [x] 1.1 Crear estructura del proyecto React + TypeScript + Vite + Tailwind CSS
    - Inicializar proyecto con Vite (template react-ts)
    - Configurar Tailwind CSS con PostCSS
    - Instalar dependencias: papaparse, vitest, fast-check, msw, @types/papaparse
    - Configurar vitest en `vite.config.ts`
    - Crear estructura de directorios: `src/modules/`, `src/components/`, `src/types/`, `src/context/`, `src/utils/`
    - _Requisitos: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Definir tipos e interfaces en `src/types/`
    - Crear `src/types/csv.ts`: ColumnProfile, CSVSummary
    - Crear `src/types/findings.ts`: Severity, Finding, DetectionResult
    - Crear `src/types/candidates.ts`: CandidateType, ColumnCandidate, HeuristicResult
    - Crear `src/types/risk.ts`: RiskBreakdown, RiskScore
    - Crear `src/types/enrichment.ts`: EnrichRequest, EnrichResponse, EnrichedExplanation
    - Crear `src/types/state.ts`: AppState, AppAction (para useReducer)
    - Crear `src/types/index.ts`: re-exportar todos los tipos
    - _Requisitos: 1.1, 2.1, 2.5, 3.1, 5.1, 6.1_

  - [x] 1.3 Crear archivo de constantes y configuración de entorno
    - Crear `src/constants.ts`: MAX_FILE_SIZE (10 MB), MAX_SAMPLE_ROWS (10), SEVERITY_WEIGHTS ({alto: 20, medio: 10, bajo: 5}), ALLOWED_EXTENSIONS, MAX_COLUMN_NAME_LENGTH (128), MAX_PAYLOAD_SIZE (64 KB)
    - Crear `.env.example` con placeholder `VITE_API_URL=http://localhost:3001`
    - _Requisitos: 1.4, 5.1_

- [x] 2. Checkpoint Fase 1
  - Verificar que el proyecto compila sin errores (`npm run build`).
  - Verificar que `npm run dev` inicia la aplicación vacía.
  - Commit sugerido: `feat: estructura base del proyecto con tipos e interfaces`

- [ ] 3. FASE 2 — Motor determinístico
  - [x] 3.1 Implementar Analizador_CSV (`src/modules/analizador-csv.ts`)
    - Implementar `validateFile(file: File)`: validar extensión .csv, tamaño ≤10MB, verificar que no esté vacío
    - Implementar `parse(file: File)`: leer como texto UTF-8, parsear con PapaParse, generar CSVSummary con perfilado de columnas (tipo inferido, nullCount, emptyCount, uniqueCount, sampleValues)
    - Manejar errores de parseo: reportar filas con error sin bloquear el análisis
    - _Requisitos: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implementar Motor_Deteccion (`src/modules/motor-deteccion.ts`)
    - Implementar detección de nulos por columna (conteo y porcentaje)
    - Implementar detección de vacíos por columna (cadenas vacías o solo espacios)
    - Implementar detección de filas duplicadas exactas
    - Implementar detección de fechas inválidas en columnas temporales
    - Implementar regla de datos tardíos (BAJA prioridad): solo si ≥2 columnas temporales compatibles, caso contrario → "no evaluable". Si complica el MVP, siempre retornar "no evaluable"
    - Implementar clasificación de severidad (alto, medio, bajo) según umbrales
    - Generar explicación basada en reglas y acción recomendada para cada hallazgo
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3_

  - [x] 3.3 Implementar Motor_Heuristico (`src/modules/motor-heuristico.ts`)
    - Implementar heurísticas de nombres de columnas (patrones como "id", "key", "code", "updated_at", "modified_date")
    - Implementar evaluación por tipo de dato, unicidad y nulidad
    - Clasificar candidatas como primary_key, business_key o incremental_marker
    - Asignar confianza (alta, media, baja) con razonamiento textual
    - Retornar `insufficientEvidence: true` cuando no hay candidatas claras
    - _Requisitos: 3.1, 3.2, 3.3, 3.5_

  - [ ] 3.4 Implementar Calculador_Riesgo (`src/modules/calculador-riesgo.ts`)
    - Implementar fórmula: `min(100, (alto × 20) + (medio × 10) + (bajo × 5))`
    - Generar desglose (RiskBreakdown) por cada hallazgo
    - Retornar puntaje 0 cuando no hay hallazgos
    - Cap a 100 sin importar cantidad de hallazgos
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [ ] 3.5 Escribir tests unitarios obligatorios del motor determinístico
    - Tests de Analizador_CSV: parseo correcto de CSV válido, rechazo de archivo no-CSV, rechazo de archivo >10MB, generación correcta de CSVSummary
    - Tests de Motor_Deteccion: detección de nulos, detección de vacíos, detección de duplicados exactos, detección de fechas inválidas, clasificación de severidad
    - Tests de Calculador_Riesgo: fórmula correcta con hallazgos mixtos, cap a 100, caso con 0 hallazgos retorna 0
    - Ejecutar con `npx vitest --run`
    - _Requisitos: 1.1, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.4_

  - [ ] 3.6 Escribir property test obligatorio de la fórmula de puntaje de riesgo
    - **Propiedad 1: Correctitud de la fórmula de puntaje de riesgo**
    - **Valida: Requisitos 5.1, 5.2, 5.4**
    - Usar fast-check con mínimo 100 iteraciones
    - Generar combinaciones arbitrarias de hallazgos (alto, medio, bajo)
    - Verificar que resultado == min(100, alto×20 + medio×10 + bajo×5)
    - Verificar que resultado está en rango [0, 100]

  - [ ]* 3.7 Escribir property tests opcionales de conteo de nulos/vacíos y duplicados
    - **Propiedad 2: Correctitud del conteo de nulos y vacíos**
    - **Valida: Requisitos 2.1, 2.2**
    - **Propiedad 3: Correctitud del conteo de duplicados**
    - **Valida: Requisito 2.3**
    - Usar fast-check con mínimo 100 iteraciones por propiedad

- [ ] 4. Checkpoint Fase 2
  - Todos los tests pasan (`npx vitest --run`).
  - Módulos exportan correctamente y pueden importarse sin error.
  - Commit sugerido: `feat: motor determinístico completo con tests`

- [ ] 5. FASE 3 — MVP web local
  - [ ] 5.1 Crear AppContext con React Context + useReducer
    - Implementar `src/context/AppContext.tsx` con AppState del diseño
    - Implementar reducer con acciones: SET_FILE, SET_SUMMARY, SET_SAMPLE_ROWS, SET_FINDINGS, SET_CANDIDATES, SET_RISK_SCORE, SET_ENRICHMENT, SET_AI_STATUS, SET_PHASE, SET_ERROR, RESET
    - NOTA MEMORIA: Las filas completas del CSV pueden existir temporalmente durante el análisis, pero NO se guardan en el contexto. Solo se conservan: CSVSummary, sampleRows (máx 10), Finding[], ColumnCandidate[], RiskScore
    - _Requisitos: 1.1, 2.1, 5.1, 7.1_

  - [ ] 5.2 Implementar componente FileUploader
    - Crear `src/components/FileUploader.tsx` con drag-and-drop
    - Validación client-side: extensión .csv, tamaño ≤10MB
    - Mostrar mensaje de error descriptivo si el archivo es inválido
    - Feedback visual durante la carga (estado loading)
    - _Requisitos: 1.3, 1.4_

  - [ ] 5.3 Implementar preview de estructura y orquestador local
    - Crear `src/components/StructurePreview.tsx`: mostrar resumen (filas, columnas, tipos) + hasta 10 filas de muestra
    - Crear `src/modules/orchestrator.ts`: coordinar flujo parse → detect → heuristic → risk → report
    - El orquestador libera las filas completas del CSV después del análisis, conservando solo sampleRows
    - _Requisitos: 1.1, 1.2, 7.4_

  - [ ] 5.4 Implementar componentes de reporte y puntaje
    - Crear `src/components/ReportView.tsx`: lista de hallazgos con severidad, descripción, explicación por reglas, acción recomendada
    - Crear `src/components/RiskScoreDisplay.tsx`: puntaje numérico + barra visual + desglose por hallazgo
    - Crear `src/components/CandidateConfirmation.tsx`: lista de candidatas con botones confirmar/rechazar
    - _Requisitos: 3.4, 5.3, 7.1, 7.2, 7.5_

  - [ ] 5.5 Implementar Generador_Reporte y exportación Markdown
    - Crear `src/modules/generador-reporte.ts`: generar contenido Markdown con estructura, hallazgos, puntaje, candidatas confirmadas
    - Crear botón de exportación en la UI que descarga el archivo .md
    - El sistema funciona completamente en modo `rules_only` sin necesidad de AWS
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 5.6 Escribir test de integración obligatorio del flujo local
    - Test end-to-end sin AWS: cargar CSV de prueba → parseo → detección → heurísticas → puntaje → generación de reporte
    - Verificar que el reporte contiene hallazgos detectados, puntaje correcto y candidatas identificadas
    - Verificar que el modo es `rules_only` (sin enriquecimiento IA)
    - Ejecutar con `npx vitest --run`
    - _Requisitos: 1.1, 2.1, 2.3, 5.1, 7.1_

- [ ] 6. Checkpoint Fase 3
  - Demo local funcional: cargar CSV, ver hallazgos, confirmar candidatas, exportar Markdown.
  - Todo funciona sin AWS en modo reglas.
  - Commit sugerido: `feat: MVP web local funcional con modo reglas`

- [ ] 7. FASE 4 — Preparación AWS
  - [ ] 7.1 Verificar entorno AWS y acceso a Bedrock
    - Verificar cuenta AWS activa y región disponible
    - Verificar acceso a Amazon Bedrock en la consola (Model Access habilitado)
    - Seleccionar un BEDROCK_MODEL_ID disponible y habilitado — NO asumir ningún modelo hasta completar esta validación
    - Instalar y verificar AWS CLI (`aws --version`, `aws sts get-caller-identity`)
    - Instalar y verificar AWS SAM CLI (`sam --version`)
    - Documentar en `docs/aws-setup.md` el modelo elegido, la región y los permisos verificados
    - _Requisitos: 6.1, 6.2_

- [ ] 8. Checkpoint Fase 4
  - AWS CLI y SAM funcionan, Bedrock está habilitado con un modelo accesible.
  - Commit sugerido: `docs: validación de entorno AWS y modelo Bedrock`

- [ ] 9. FASE 5 — Agente_Auditor
  - [ ] 9.1 Implementar mock local del endpoint POST /audit/enrich
    - Crear mock con msw para desarrollo local (interceptar POST /audit/enrich)
    - El mock retorna respuestas realistas de tipo EnrichResponse
    - Permite probar la integración frontend-backend sin depender de AWS
    - _Requisitos: 6.1, 6.2_

  - [ ] 9.2 Crear handler Lambda del Agente_Auditor (`backend/src/handler.ts`)
    - Crear directorio `backend/` con package.json, tsconfig.json
    - Implementar validación del payload: estructura, tipos, tamaño máximo 64 KB
    - Implementar sanitización de nombres de columnas: máx 128 chars, solo alfanuméricos + guiones
    - Implementar construcción del prompt con delimitadores claros (prevención de prompt injection)
    - Implementar invocación a Amazon Bedrock vía Converse API con BEDROCK_MODEL_ID configurable y timeout 25s
    - Implementar parseo de respuesta de Bedrock → EnrichResponse
    - Implementar manejo de errores: timeout → error tipado, error genérico → log + error tipado
    - Implementar CORS restringido con variable ALLOWED_ORIGIN
    - _Requisitos: 6.1, 6.3_

  - [ ] 9.3 Integrar frontend con el Agente_Auditor
    - Crear `src/modules/enrichment-client.ts`: llamada HTTP POST a VITE_API_URL + `/audit/enrich`
    - Implementar modo degradado: si la llamada falla o timeout, continuar con explicaciones de reglas
    - Indicar visualmente en la UI si explicación es IA o reglas (badge/icono diferenciado)
    - Mostrar banner de modo degradado cuando el servicio de IA no está disponible
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [ ] 9.4 Escribir tests unitarios obligatorios del handler Lambda
    - Test de validación de payload (rechazar estructura inválida, payload >64KB)
    - Test de sanitización de nombres de columnas
    - Test de manejo de timeout (simular timeout de Bedrock)
    - Test de formato de respuesta (EnrichResponse válida)
    - Ejecutar con `npx vitest --run` en directorio backend
    - _Requisitos: 6.1_

  - [ ]* 9.5 Escribir test de integración opcional con mock del Agente_Auditor
    - Test end-to-end con msw interceptando el endpoint
    - Verificar flujo completo: CSV → análisis → enriquecimiento mock → reporte con explicaciones IA
    - Verificar modo degradado cuando el mock falla
    - _Requisitos: 6.1, 6.2_

- [ ] 10. Checkpoint Fase 5
  - Frontend se conecta al mock local, luego al Lambda real.
  - Modo degradado funciona correctamente si Bedrock falla.
  - Commit sugerido: `feat: Agente_Auditor con Lambda y Bedrock integrado`

- [ ] 11. FASE 6 — Despliegue
  - [ ] 11.1 Crear template SAM y desplegar backend
    - Crear `backend/template.yaml`: Lambda + API Gateway, runtime nodejs20.x, timeout 30s, memoria 256 MB
    - Variables de entorno: BEDROCK_MODEL_ID (configurable), BEDROCK_REGION, ALLOWED_ORIGIN
    - Política IAM: bedrock:InvokeModel (restringir al ARN del modelo confirmado) + logs:*
    - Desplegar: `sam build && sam deploy --guided`
    - Verificar endpoint funcional con curl o Postman
    - _Requisitos: 6.1_

  - [ ] 11.2 Configurar Amplify hosting y conectar frontend
    - Crear `amplify.yml` con configuración de build del frontend
    - Conectar repositorio a Amplify
    - Configurar VITE_API_URL en variables de entorno de Amplify con la URL del API Gateway
    - Configurar ALLOWED_ORIGIN en Lambda con el dominio de Amplify
    - Verificar logs en CloudWatch
    - _Requisitos: 6.1, 7.1_

- [ ] 12. Checkpoint Fase 6
  - App accesible desde la URL de Amplify.
  - Agente_Auditor responde desde Lambda.
  - Logs visibles en CloudWatch.
  - Commit sugerido: `deploy: MVP desplegado en AWS (Amplify + Lambda + Bedrock)`

- [ ] 13. FASE 7 — Entregables
  - [ ] 13.1 Crear README.md completo
    - Descripción del proyecto y problema que resuelve
    - Instrucciones de instalación y ejecución local (`npm install`, `npm run dev`, `npm test`)
    - Arquitectura y servicios AWS usados (diagrama simplificado)
    - Sección sobre cómo se utilizó Kiro (spec-driven development, directorio `.kiro/specs/`)
    - Casos de uso y notas para la presentación
    - _Requisitos: 7.1_

  - [ ] 13.2 Crear archivos CSV de demostración
    - Crear `demo/riesgo-bajo.csv`: datos limpios, pocas issues (pocos nulos, sin duplicados)
    - Crear `demo/riesgo-medio.csv`: algunos nulos, fechas en formatos mixtos, pocas candidatas
    - Crear `demo/riesgo-alto.csv`: muchos nulos, duplicados frecuentes, sin columnas temporales claras
    - Verificar que los 3 CSVs producen reportes coherentes con su nivel de riesgo
    - _Requisitos: 1.1, 2.1, 5.1_

  - [ ] 13.3 Agregar checklist de entrega y preparación de demo
    - Checklist para demo online: URL funcional, CSV de prueba listo, flujo completo verificado
    - Notas para video de presentación: qué mostrar, en qué orden
    - Verificar que la app desplegada funciona con los CSVs de demo
    - _Requisitos: 7.1, 7.3_

- [ ] 14. Checkpoint Final
  - README listo, CSVs de demo probados, app desplegada y funcional.
  - Commit sugerido: `docs: README, CSVs de demo y checklist de entrega`

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para avanzar más rápido hacia el MVP.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los checkpoints verifican que cada fase está completa antes de avanzar.
- Los property tests validan propiedades universales de correctitud definidas en el diseño.
- Los tests unitarios validan comportamiento específico y casos borde.
- **Memoria:** Las filas completas del CSV pueden existir temporalmente durante el análisis (parseo y detección), pero NO se guardan en React Context. Solo se conservan: CSVSummary, sampleRows (máx 10), Finding[], ColumnCandidate[] y RiskScore.
- **Datos tardíos:** Regla de BAJA prioridad. Solo ejecutar si ≥2 columnas temporales compatibles. Si complica el MVP, siempre retornar "no evaluable".
- **Modelo Bedrock:** NO asumir ningún modelo. Validar disponibilidad en Fase 4 antes de implementar.
- Las fases son estrictamente secuenciales. No iniciar una fase hasta completar la anterior.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["3.4"] },
    { "id": 7, "tasks": ["3.5"] },
    { "id": 8, "tasks": ["3.6"] },
    { "id": 9, "tasks": ["3.7"] },
    { "id": 10, "tasks": ["5.1"] },
    { "id": 11, "tasks": ["5.2"] },
    { "id": 12, "tasks": ["5.3"] },
    { "id": 13, "tasks": ["5.4"] },
    { "id": 14, "tasks": ["5.5"] },
    { "id": 15, "tasks": ["5.6"] },
    { "id": 16, "tasks": ["7.1"] },
    { "id": 17, "tasks": ["9.1"] },
    { "id": 18, "tasks": ["9.2"] },
    { "id": 19, "tasks": ["9.3"] },
    { "id": 20, "tasks": ["9.4"] },
    { "id": 21, "tasks": ["9.5"] },
    { "id": 22, "tasks": ["11.1"] },
    { "id": 23, "tasks": ["11.2"] },
    { "id": 24, "tasks": ["13.1"] },
    { "id": 25, "tasks": ["13.2"] },
    { "id": 26, "tasks": ["13.3"] }
  ]
}
```
