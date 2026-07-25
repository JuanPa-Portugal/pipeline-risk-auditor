import { useCallback, useMemo } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Orchestrator } from './modules/orchestrator';
import { generateMarkdownReport } from './modules/generador-reporte';
import { buildEnrichRequest, enrichFindings } from './modules/enrichment-client';
import { FileUploader } from './components/FileUploader';
import { StructurePreview } from './components/StructurePreview';
import { RiskScoreDisplay } from './components/RiskScoreDisplay';
import { ReportView } from './components/ReportView';
import { CandidateConfirmation } from './components/CandidateConfirmation';
import { ExportMarkdownButton } from './components/ExportMarkdownButton';

const orchestrator = new Orchestrator();

function AppContent() {
  const { state, dispatch } = useAppContext();
  const {
    fileInfo,
    summary,
    sampleRows,
    findings,
    candidates,
    riskScore,
    enrichment,
    aiStatus,
    analysisPhase,
    error,
  } = state;

  const isProcessing =
    analysisPhase === 'parsing' ||
    analysisPhase === 'analyzing' ||
    analysisPhase === 'enriching';
  const hasResults = analysisPhase === 'complete' && summary !== null && riskScore !== null;

  // --- Analysis execution ---
  const handleFileAccepted = useCallback(async (file: File) => {
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_AI_STATUS', payload: 'idle' });
    dispatch({ type: 'SET_PHASE', payload: 'analyzing' });

    try {
      const result = await orchestrator.analyze(file);

      // Store local analysis results
      dispatch({ type: 'SET_SUMMARY', payload: result.summary });
      dispatch({ type: 'SET_SAMPLE_ROWS', payload: result.sampleRows });
      dispatch({ type: 'SET_FINDINGS', payload: result.findings });
      dispatch({ type: 'SET_CANDIDATES', payload: result.candidates });
      dispatch({ type: 'SET_RISK_SCORE', payload: result.riskScore });

      // Attempt enrichment via Agente_Auditor (non-blocking)
      dispatch({ type: 'SET_PHASE', payload: 'enriching' });
      dispatch({ type: 'SET_AI_STATUS', payload: 'loading' });

      const enrichRequest = buildEnrichRequest(
        result.summary,
        result.findings,
        result.candidates,
        result.riskScore,
      );

      const enrichResult = await enrichFindings(enrichRequest);

      if (enrichResult.success) {
        dispatch({ type: 'SET_ENRICHMENT', payload: enrichResult.response });
        dispatch({ type: 'SET_AI_STATUS', payload: 'success' });
      } else {
        // Enrichment failed — continue with rules-only mode
        dispatch({ type: 'SET_AI_STATUS', payload: 'error' });
      }

      // Always complete regardless of enrichment outcome
      dispatch({ type: 'SET_PHASE', payload: 'complete' });
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Ocurrió un error inesperado durante el análisis.';
      dispatch({ type: 'SET_ERROR', payload: message });
      dispatch({ type: 'SET_PHASE', payload: 'idle' });
    }
  }, [dispatch]);

  // --- Candidate confirmation ---
  const handleConfirmCandidate = useCallback((columnName: string) => {
    const updated = candidates.map((c) =>
      c.columnName === columnName ? { ...c, confirmedByUser: true } : c
    );
    dispatch({ type: 'SET_CANDIDATES', payload: updated });
  }, [candidates, dispatch]);

  const handleRejectCandidate = useCallback((columnName: string) => {
    const updated = candidates.filter((c) => c.columnName !== columnName);
    dispatch({ type: 'SET_CANDIDATES', payload: updated });
  }, [candidates, dispatch]);

  // --- Markdown generation ---
  const markdownContent = useMemo(() => {
    if (!fileInfo || !summary || !riskScore) return '';
    return generateMarkdownReport({
      fileName: fileInfo.name,
      summary,
      findings,
      candidates,
      riskScore,
    });
  }, [fileInfo, summary, findings, candidates, riskScore]);

  // --- Reset ---
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Pipeline Risk Auditor</h1>
          <p className="text-sm text-gray-600 mt-1">
            Analiza archivos CSV para detectar riesgos de calidad de datos antes de su ingesta en pipelines.
          </p>
          <div className="flex items-center gap-2 mt-2">
            {aiStatus === 'success' ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                Modo IA · Explicaciones enriquecidas
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                Modo local · Reglas
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Error message */}
        {error && (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Degraded mode banner */}
        {hasResults && aiStatus === 'error' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium">
              Modo degradado: el servicio de IA no está disponible.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              Las explicaciones y recomendaciones se muestran basadas en reglas determinísticas locales.
            </p>
          </div>
        )}

        {/* File upload (visible when no results and not processing) */}
        {!hasResults && !isProcessing && (
          <FileUploader
            onFileAccepted={handleFileAccepted}
            isLoading={isProcessing}
            disabled={isProcessing}
          />
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="text-center py-4">
            <div className="inline-block w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 mt-2">
              {analysisPhase === 'enriching'
                ? 'Consultando servicio de IA...'
                : 'Analizando archivo...'}
            </p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <>
            {/* Executive summary from AI (if available) */}
            {enrichment && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h3 className="text-sm font-semibold text-purple-800 mb-1">
                  Resumen ejecutivo
                  <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-200 text-purple-700">IA</span>
                </h3>
                <p className="text-sm text-purple-900">{enrichment.executiveSummary}</p>
                <p className="text-sm text-purple-800 mt-2 italic">{enrichment.overallRiskAssessment}</p>
              </div>
            )}

            {/* Structure preview */}
            {summary && sampleRows && (
              <StructurePreview summary={summary} sampleRows={sampleRows} />
            )}

            {/* Risk score */}
            {riskScore && (
              <RiskScoreDisplay riskScore={riskScore} />
            )}

            {/* Findings (rule-based) */}
            <ReportView findings={findings} />

            {/* AI-enriched explanations (if available) */}
            {enrichment && enrichment.explanations.length > 0 && (
              <section className="w-full">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">
                  Explicaciones enriquecidas por IA
                  <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-200 text-purple-700">IA</span>
                </h2>
                <ul className="space-y-3">
                  {enrichment.explanations.map((exp) => {
                    // Associate by findingId — safely handle missing findings
                    const associatedFinding = findings.find((f) => f.id === exp.findingId);

                    return (
                      <li key={exp.findingId} className="p-4 border border-purple-200 bg-purple-50 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-xs text-purple-700">{exp.findingId}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            exp.priority === 'critical' ? 'bg-red-200 text-red-800' :
                            exp.priority === 'high' ? 'bg-red-100 text-red-700' :
                            exp.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {exp.priority}
                          </span>
                        </div>
                        {associatedFinding && (
                          <p className="text-xs text-gray-600 mb-2 italic">
                            Hallazgo: {associatedFinding.description}
                          </p>
                        )}
                        <p className="text-sm text-gray-900 mb-1"><strong>Impacto técnico:</strong> {exp.technicalImpact}</p>
                        <p className="text-sm text-gray-700 mb-1"><strong>Contexto:</strong> {exp.contextualExplanation}</p>
                        <p className="text-sm text-emerald-800"><strong>Acción correctiva:</strong> {exp.correctiveAction}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Candidates */}
            <CandidateConfirmation
              candidates={candidates}
              onConfirm={handleConfirmCandidate}
              onReject={handleRejectCandidate}
              disabled={isProcessing}
            />

            {/* Export + Reset */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
              <ExportMarkdownButton
                content={markdownContent}
                sourceFileName={fileInfo?.name ?? ''}
                disabled={isProcessing || markdownContent.trim() === ''}
              />
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
              >
                Analizar otro archivo
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
