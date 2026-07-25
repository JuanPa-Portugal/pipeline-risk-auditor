# AWS Setup

## Cuenta y autenticación

- La cuenta AWS está activa.
- Se utiliza un usuario IAM administrativo para el desarrollo del hackathon.
- MFA está habilitado.
- No se utilizan credenciales del usuario root para desarrollo.
- AWS CLI está autenticado correctamente.

## Región

- Región seleccionada para el proyecto: us-west-2 (Oregon).
- us-east-1 y us-east-2 presentaron restricciones de cuotas de Amazon Bedrock durante las pruebas.
- us-west-2 fue validada correctamente para inferencia.

## AWS CLI

- AWS CLI v2 instalada y operativa.
- La región predeterminada está configurada como us-west-2.

## AWS SAM CLI

- AWS SAM CLI instalada.
- Versión validada: 1.164.0.

## Amazon Bedrock

- Proveedor/modelo seleccionado: OpenAI GPT OSS 20B.
- Model ID: openai.gpt-oss-20b-1:0
- Región: us-west-2.
- Tipo de inferencia: bajo demanda.
- API validada: Amazon Bedrock Runtime Converse.
- Se realizó una invocación real y la respuesta fue exitosa.
- La prueba terminó con stopReason end_turn.

## Seguridad

- No incluir IDs de cuenta, claves, tokens, contraseñas ni credenciales en este documento.
- Las credenciales AWS no deben almacenarse en el repositorio.
- El acceso administrativo actual se utiliza para la etapa de hackathon y deberá reducirse siguiendo el principio de mínimo privilegio cuando se definan los permisos necesarios para Lambda y Bedrock.

## Próximos pasos

- Crear la infraestructura backend con AWS SAM.
- Implementar Lambda.
- Otorgar a Lambda únicamente los permisos necesarios para invocar el modelo seleccionado en Amazon Bedrock.
- Exponer el backend mediante API Gateway.
