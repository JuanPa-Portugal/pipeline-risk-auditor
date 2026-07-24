import { useCallback, useMemo } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Orchestrator } from './modules/orchestrator';
import { generateMarkdownReport } from './modules/generador-reporte';
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
    analysisPhase,
    error,
  } = state;

  const isProcessing = analysisPhase === 'parsing' || analysisPhase === 'analyzing';
  const hasResults = analysisPhase === 'complete' && summary !== null && riskScore !== null;

  // --- Analysis execution ---
  const handleFileAccepted = useCallback(async (file: File) => {
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_PHASE', payload: 'analyzing' });

    try {
      const result = await orchestrator.analyze(file);

      dispatch({ type: 'SET_SUMMARY', payload: result.summary });
      dispatch({ type: 'SET_SAMPLE_ROWS', payload: result.sampleRows });
      dispatch({ type: 'SET_FINDINGS', payload: result.findings });
      dispatch({ type: 'SET_CANDIDATES', payload: result.candidates });
      dispatch({ type: 'SET_RISK_SCORE', payload: result.riskScore });
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
          <span className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
            Modo local · Reglas
          </span>
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

        {/* File upload (visible when no results or idle) */}
        {!hasResults && (
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
            <p className="text-sm text-gray-600 mt-2">Analizando archivo...</p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <>
            {/* Structure preview */}
            {summary && sampleRows && (
              <StructurePreview summary={summary} sampleRows={sampleRows} />
            )}

            {/* Risk score */}
            {riskScore && (
              <RiskScoreDisplay riskScore={riskScore} />
            )}

            {/* Findings */}
            <ReportView findings={findings} />

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
