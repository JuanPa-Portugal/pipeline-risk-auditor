# AWS Setup

## Cuenta y autenticación

- La cuenta AWS está activa.
- Se utiliza un usuario IAM administrativo para el desarrollo del hackathon.
- MFA está habilitado.
- No se utilizan credenciales del usuario root para desarrollo.
- AWS CLI está autenticado correctamente.

## Región

- Región seleccionada para el proyecto: us-west-2 (Oregon).
- us-east-1 y us-east-2 presentaron restricciones de cuotas de Amazon Bedrock durante las pruebas (contexto histórico que justifica la selección de us-west-2).
- us-west-2 fue validada correctamente para inferencia.

## AWS CLI

- AWS CLI v2 instalada y operativa.
- La región predeterminada está configurada como us-west-2.

## AWS SAM CLI

- AWS SAM CLI instalada.
- Versión validada: 1.164.0.

## Amazon Bedrock Mantle

- Servicio utilizado: Amazon Bedrock Mantle.
- API utilizada: Amazon Bedrock Mantle Responses API.
- Proveedor/modelo: OpenAI GPT OSS 20B.
- Model ID: `openai.gpt-oss-20b`.
- Región: us-west-2.
- Endpoint regional: `https://bedrock-mantle.us-west-2.api.aws/v1/responses`
- El backend construye el endpoint utilizando la variable `AWS_REGION` proporcionada automáticamente por Lambda.
- Las solicitudes se firman con AWS SigV4.
- El service utilizado para la firma es `bedrock-mantle`.
- La integración utiliza inferencia bajo demanda.
- Timeout interno de la solicitud a Mantle: 25 segundos.
- Lambda tiene un timeout total de 30 segundos.
- Los 5 segundos restantes se reservan para el procesamiento de Lambda y la construcción de la respuesta.
- Ante un error o timeout, el frontend activa el modo degradado mediante reglas determinísticas.

## Backend e infraestructura

- Infraestructura definida mediante AWS SAM.
- Fuentes de verdad: `backend/template.yaml` y `backend/samconfig.toml`.
- Stack name: `pipeline-risk-auditor`.
- Región de despliegue: us-west-2.
- Runtime: nodejs22.x.
- Architecture: x86_64.
- Handler: handler.handler.
- Timeout: 30.
- MemorySize: 256.
- BuildMethod: esbuild.
- Target: es2022.
- Format: cjs.
- Endpoint: `POST /audit/enrich`.
- Endpoint: `OPTIONS /audit/enrich`.
- Stage: Prod.
- La API no tiene autenticación configurada durante el MVP.
- `ALLOWED_ORIGIN` controla el origen permitido por CORS.

Este documento no duplica el contenido completo de `backend/template.yaml`.

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `BEDROCK_MODEL_ID` | Modelo de Bedrock Mantle. Valor actual: `openai.gpt-oss-20b`. |
| `ALLOWED_ORIGIN` | Origen permitido para las solicitudes CORS del frontend. |
| `AWS_REGION` | Variable proporcionada automáticamente por Lambda y utilizada para construir el endpoint regional de Mantle. |

## Seguridad y permisos IAM

- No incluir IDs de cuenta, claves, tokens, contraseñas ni credenciales en este documento.
- Las credenciales AWS no deben almacenarse en el repositorio.
- No se almacenan claves AWS en el frontend ni en el repositorio.
- Lambda utiliza las credenciales temporales asociadas a su rol de ejecución.

Permisos actuales de Lambda:

- `bedrock-mantle:CreateInference`
- `bedrock-mantle:GetProject`
- `bedrock-mantle:ListProjects`
- `bedrock-mantle:ListTagsForResource`

Para el MVP actual se utiliza `Resource: "*"`. La política deberá endurecerse posteriormente siguiendo el principio de mínimo privilegio.

## Estado actual

Completado:

- Configuración y autenticación de AWS CLI.
- Selección y validación de us-west-2.
- Configuración de AWS SAM.
- Implementación del backend con Lambda.
- Configuración de API Gateway.
- Endpoints POST y OPTIONS.
- Integración con Bedrock Mantle Responses API.
- Firma AWS SigV4 con service `bedrock-mantle`.
- Configuración inicial de permisos IAM para Mantle.

## Próximos pasos

- Validar el flujo completo desde el frontend hasta Lambda y Bedrock Mantle.
- Configurar `ALLOWED_ORIGIN` con el dominio definitivo del frontend.
- Ejecutar pruebas de errores, timeout y modo degradado.
- Reducir los permisos IAM aplicando mínimo privilegio cuando AWS permita definir recursos más específicos para esta integración.
- Documentar el endpoint desplegado sin incluir identificadores sensibles.
