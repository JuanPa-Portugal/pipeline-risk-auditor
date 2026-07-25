import { http, HttpResponse } from 'msw';
import type { Severity } from '../types/findings';
import type { EnrichRequest, EnrichedExplanation, EnrichResponse } from '../types/enrichment';

/**
 * Converts internal severity ('alto'|'medio'|'bajo') to EnrichedExplanation priority.
 */
function severityToPriority(severity: Severity): EnrichedExplanation['priority'] {
  switch (severity) {
    case 'alto': return 'high';
    case 'medio': return 'medium';
    case 'bajo': return 'low';
  }
}

/**
 * Generates a mock technical impact explanation based on finding details.
 */
function generateTechnicalImpact(finding: EnrichRequest['findings'][number]): string {
  const pct = finding.percentage !== undefined ? ` (${finding.percentage.toFixed(1)}%)` : '';
  return `Se detectaron ${finding.count} ocurrencias${pct} en la categoría "${finding.category}". Esto puede afectar la integridad de los datos en pipelines downstream y generar resultados incorrectos en consumidores.`;
}

/**
 * Generates a mock contextual explanation.
 */
function generateContextualExplanation(finding: EnrichRequest['findings'][number]): string {
  return `En el contexto de ingeniería de datos, el hallazgo "${finding.description}" indica un posible problema de calidad que debería investigarse antes de la ingesta en producción.`;
}

/**
 * Generates a mock corrective action.
 */
function generateCorrectiveAction(finding: EnrichRequest['findings'][number]): string {
  return `Revisar la fuente de datos para la categoría "${finding.category}". Considerar implementar validaciones de calidad en el punto de extracción y agregar un paso de limpieza previo a la carga.`;
}

/**
 * Mock handlers for local development.
 * Simulates the POST /audit/enrich endpoint with realistic responses
 * based on the actual EnrichRequest payload.
 */
export const handlers = [
  http.post('*/audit/enrich', async ({ request }) => {
    const body = await request.json() as EnrichRequest;

    // Basic validation: findings must be an array
    if (!body.findings || !Array.isArray(body.findings)) {
      return HttpResponse.json(
        { error: 'INVALID_PAYLOAD', message: 'El campo findings debe ser un arreglo.' },
        { status: 400 }
      );
    }

    // Generate one explanation per finding
    const explanations: EnrichedExplanation[] = body.findings.map((finding) => ({
      findingId: finding.id,
      technicalImpact: generateTechnicalImpact(finding),
      contextualExplanation: generateContextualExplanation(finding),
      correctiveAction: generateCorrectiveAction(finding),
      priority: severityToPriority(finding.severity),
    }));

    // Generate executive summary based on risk score and finding count
    const riskLevel = body.riskScore >= 60 ? 'alto' : body.riskScore >= 30 ? 'medio' : 'bajo';
    const executiveSummary = `El archivo analizado presenta un puntaje de riesgo de ${body.riskScore}/100 (nivel ${riskLevel}). Se identificaron ${body.findings.length} hallazgos que requieren atención antes de la ingesta en producción.`;

    // Generate overall risk assessment based on level
    let overallRiskAssessment: string;
    if (riskLevel === 'alto') {
      overallRiskAssessment = 'Se recomienda NO ingestar los datos sin resolver los hallazgos críticos. El nivel de riesgo es alto y podría causar problemas significativos en los consumidores downstream.';
    } else if (riskLevel === 'medio') {
      overallRiskAssessment = 'Se recomienda revisar los hallazgos identificados antes de proceder con la ingesta. Algunos problemas podrían impactar la calidad de los datos en destino.';
    } else {
      overallRiskAssessment = 'El nivel de riesgo es bajo. Los datos pueden ingresarse con precauciones menores. Se sugiere monitorear los hallazgos identificados.';
    }

    const response: EnrichResponse = {
      explanations,
      executiveSummary,
      overallRiskAssessment,
      source: 'ai',
    };

    return HttpResponse.json(response);
  }),
];
