# Documento de Requisitos — Pipeline Risk Auditor

## Introducción

Pipeline Risk Auditor es una herramienta que analiza archivos CSV para detectar riesgos de calidad de datos antes de su ingesta en pipelines de datos. El sistema identifica problemas como valores nulos, duplicados, fechas inválidas y columnas candidatas a clave o carga incremental, generando un puntaje de riesgo y un reporte con hallazgos accionables. Las explicaciones pueden enriquecerse con IA cuando el servicio esté disponible, con funcionamiento degradado basado en reglas como respaldo.

El alcance se divide en **MVP Obligatorio** (completable en un hackathon de 7 días) y **Funcionalidades Futuras / Opcionales** (mejoras post-MVP).

## Glosario

- **Sistema**: La aplicación Pipeline Risk Auditor en su conjunto.
- **Analizador_CSV**: Módulo responsable de cargar, parsear y perfilar archivos CSV.
- **Motor_Deteccion**: Módulo que ejecuta reglas determinísticas para detectar problemas de calidad en los datos.
- **Motor_Heuristico**: Módulo que aplica heurísticas basadas en nombres de columnas, tipos de datos, unicidad y nulidad para sugerir columnas candidatas.
- **Calculador_Riesgo**: Módulo que calcula el puntaje de riesgo agregado a partir de los hallazgos individuales.
- **Generador_Reporte**: Módulo que produce el reporte final visible en interfaz y exportable en Markdown.
- **Servicio_IA**: Servicio externo de inteligencia artificial que genera explicaciones enriquecidas para los hallazgos.
- **Hallazgo**: Un problema o riesgo potencial detectado en los datos, con severidad, explicación y acción recomendada.
- **Puntaje_Riesgo**: Valor numérico de 0 a 100 que representa el nivel de riesgo agregado del archivo analizado.
- **Columna_Candidata**: Columna identificada heurísticamente como posible clave primaria, clave de negocio o marcador de carga incremental; requiere confirmación del usuario.
- **Riesgo_Potencial**: Observación que indica un posible problema sin certeza absoluta, requiriendo validación adicional.

---

## MVP Obligatorio

### Requisito 1: Carga y Análisis de Archivo CSV

**Historia de Usuario:** Como ingeniero de datos, quiero cargar un archivo CSV para que el sistema lo analice y me proporcione un resumen de su estructura.

#### Criterios de Aceptación

1. WHEN el usuario carga un archivo CSV válido, THE Analizador_CSV SHALL parsear el archivo y generar un resumen que incluya número de filas, número de columnas y tipos de datos inferidos para cada columna.
2. WHEN el archivo CSV contiene encabezados, THE Analizador_CSV SHALL utilizar la primera fila como nombres de columnas.
3. IF el archivo cargado no es un CSV válido o está vacío, THEN THE Sistema SHALL mostrar un mensaje de error descriptivo indicando el motivo del rechazo.
4. IF el archivo excede el tamaño máximo permitido, THEN THE Sistema SHALL informar al usuario el límite de tamaño y rechazar el archivo.

---

### Requisito 2: Detección Determinística de Problemas de Calidad

**Historia de Usuario:** Como ingeniero de datos, quiero que el sistema detecte automáticamente problemas comunes de calidad en mis datos para identificar riesgos antes de la ingesta.

#### Criterios de Aceptación

1. WHEN el archivo CSV ha sido parseado, THE Motor_Deteccion SHALL identificar columnas con valores nulos y reportar el conteo y porcentaje de nulos por columna.
2. WHEN el archivo CSV ha sido parseado, THE Motor_Deteccion SHALL identificar columnas con valores vacíos (cadenas vacías o solo espacios) y reportar el conteo y porcentaje por columna.
3. WHEN el archivo CSV ha sido parseado, THE Motor_Deteccion SHALL identificar filas duplicadas exactas y reportar el número de duplicados encontrados.
4. WHEN el archivo CSV contiene columnas con formato de fecha, THE Motor_Deteccion SHALL validar que los valores se ajusten a formatos de fecha reconocibles y reportar las fechas inválidas encontradas.
5. THE Motor_Deteccion SHALL clasificar cada hallazgo con una severidad: alto, medio o bajo.

---

### Requisito 3: Identificación Heurística de Columnas Candidatas

**Historia de Usuario:** Como ingeniero de datos, quiero que el sistema sugiera columnas candidatas a clave y a carga incremental para poder evaluar la estructura de mis datos.

#### Criterios de Aceptación

1. WHEN el análisis de calidad ha finalizado, THE Motor_Heuristico SHALL evaluar columnas como candidatas a clave primaria o clave de negocio basándose en heurísticas de nombres de columnas, tipos de datos, unicidad y nulidad.
2. WHEN el análisis de calidad ha finalizado, THE Motor_Heuristico SHALL evaluar columnas como candidatas a marcador de carga incremental basándose en heurísticas de nombres de columnas (por ejemplo, "updated_at", "modified_date"), tipos de datos temporales y ordenamiento.
3. THE Motor_Heuristico SHALL presentar las columnas candidatas como sugerencias con etiqueta de "posible candidata" y no como afirmaciones definitivas.
4. WHEN el Motor_Heuristico identifica columnas candidatas, THE Sistema SHALL solicitar confirmación del usuario antes de incluirlas como hallazgo confirmado en el reporte.
5. IF la evidencia es insuficiente para identificar columnas candidatas, THEN THE Motor_Heuristico SHALL indicar que no se encontraron candidatas con suficiente confianza y reportar esto como información no confirmada.

---

### Requisito 4: Detección de Riesgos Potenciales en Datos

**Historia de Usuario:** Como ingeniero de datos, quiero que el sistema me alerte sobre posibles riesgos relacionados con datos tardíos, actualizaciones y eliminaciones para poder investigarlos.

#### Criterios de Aceptación

1. WHEN el análisis detecta patrones que sugieren posible llegada tardía de datos (por ejemplo, fechas significativamente anteriores al rango esperado), THE Motor_Deteccion SHALL reportar el hallazgo como "riesgo potencial" con la nota "evidencia insuficiente para confirmar".
2. WHEN el análisis detecta patrones que sugieren posibles actualizaciones o eliminaciones (por ejemplo, columnas de tipo "is_deleted", "deleted_at", "version"), THE Motor_Deteccion SHALL reportar el hallazgo como "posible riesgo" indicando que requiere validación adicional.
3. THE Motor_Deteccion SHALL utilizar lenguaje hedging en todos los hallazgos donde la certeza sea baja, evitando afirmaciones definitivas sobre el comportamiento del pipeline fuente.

---

### Requisito 5: Cálculo del Puntaje de Riesgo

**Historia de Usuario:** Como ingeniero de datos, quiero un puntaje numérico que resuma el riesgo total del archivo para priorizar la atención de mis fuentes de datos.

#### Criterios de Aceptación

1. WHEN todos los hallazgos han sido clasificados, THE Calculador_Riesgo SHALL calcular el puntaje total aplicando la fórmula: (cantidad de hallazgos de severidad alta × 20) + (cantidad de hallazgos de severidad media × 10) + (cantidad de hallazgos de severidad baja × 5).
2. THE Calculador_Riesgo SHALL limitar el puntaje máximo a 100 (capped), sin importar la cantidad de hallazgos.
3. THE Calculador_Riesgo SHALL generar un desglose que muestre la contribución individual de cada hallazgo al puntaje total.
4. WHEN no se detectan hallazgos, THE Calculador_Riesgo SHALL asignar un puntaje de 0.

---

### Requisito 6: Explicaciones Generadas por IA

**Historia de Usuario:** Como ingeniero de datos, quiero explicaciones enriquecidas por IA para entender mejor el contexto y la gravedad de cada hallazgo.

#### Criterios de Aceptación

1. WHEN el Servicio_IA está disponible, THE Sistema SHALL solicitar explicaciones contextuales para cada hallazgo y presentarlas junto a la explicación basada en reglas.
2. IF el Servicio_IA no está disponible o no responde dentro del tiempo límite, THEN THE Sistema SHALL utilizar explicaciones predefinidas basadas en reglas sin degradar la funcionalidad del reporte.
3. THE Sistema SHALL indicar visualmente si una explicación fue generada por IA o por reglas determinísticas.
4. WHEN el Sistema opera en modo degradado (sin IA), THE Sistema SHALL informar al usuario que las explicaciones son basadas en reglas y que el servicio de IA no está disponible.

---

### Requisito 7: Generación y Exportación del Reporte

**Historia de Usuario:** Como ingeniero de datos, quiero ver un reporte con todos los hallazgos en la interfaz y poder exportarlo en Markdown para compartirlo con mi equipo.

#### Criterios de Aceptación

1. WHEN el análisis ha finalizado, THE Generador_Reporte SHALL mostrar en la interfaz una lista de hallazgos con: severidad, descripción del hallazgo, explicación y acción recomendada.
2. WHEN el análisis ha finalizado, THE Generador_Reporte SHALL mostrar el puntaje de riesgo total y el desglose de contribución por hallazgo.
3. WHEN el usuario solicita exportar el reporte, THE Generador_Reporte SHALL generar un archivo Markdown con el contenido completo del reporte.
4. THE Generador_Reporte SHALL incluir en el reporte el resumen de estructura (filas, columnas, tipos inferidos) junto con los hallazgos.
5. WHEN existen columnas candidatas confirmadas por el usuario, THE Generador_Reporte SHALL incluirlas en el reporte con la etiqueta "confirmada por usuario".

---

## Funcionalidades Futuras / Opcionales

> Las siguientes funcionalidades son mejoras planificadas para después de completar el MVP basado en CSV. No forman parte del alcance del hackathon de 7 días.

### Requisito 8 (Futuro): Análisis de Consultas SQL

**Historia de Usuario:** Como ingeniero de datos, quiero que el sistema analice consultas SQL para detectar riesgos en la lógica de transformación.

#### Criterios de Aceptación

1. WHEN el usuario proporciona una consulta SQL, THE Sistema SHALL intentar parsear la consulta para identificar patrones de riesgo comunes (JOINs sin condición explícita, SELECT *, subconsultas no acotadas).
2. IF la consulta SQL utiliza un dialecto no soportado o contiene sintaxis no reconocida, THEN THE Sistema SHALL informar que el análisis es parcial e indicar qué secciones no pudieron ser parseadas.
3. THE Sistema SHALL soportar un subconjunto de dialectos SQL comunes (ANSI SQL, PostgreSQL, MySQL) sin garantizar compatibilidad universal con todos los dialectos existentes.

---

### Requisito 9 (Futuro): Ingesta de Metadatos de Tablas

**Historia de Usuario:** Como ingeniero de datos, quiero ingresar metadatos de tablas destino para que el sistema pueda cruzar la información del CSV con el esquema esperado.

#### Criterios de Aceptación

1. WHEN el usuario proporciona metadatos de tabla destino (nombres de columnas, tipos, restricciones), THE Sistema SHALL comparar la estructura del CSV con el esquema esperado y reportar discrepancias.
2. IF los metadatos proporcionados son incompletos, THEN THE Sistema SHALL analizar únicamente las columnas para las que existe información y reportar las columnas sin metadatos correspondientes.

---

### Requisito 10 (Futuro): Exportación en PDF

**Historia de Usuario:** Como ingeniero de datos, quiero exportar el reporte en formato PDF para adjuntarlo a documentación formal.

#### Criterios de Aceptación

1. WHEN el usuario solicita exportar en PDF, THE Generador_Reporte SHALL generar un archivo PDF con el contenido completo del reporte, incluyendo formato legible y estructura de secciones.
2. IF la generación de PDF falla, THEN THE Sistema SHALL informar al usuario del error y ofrecer la exportación en Markdown como alternativa.
