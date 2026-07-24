import { createContext, useContext, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { AppState, AppAction } from '../types/state';
import { MAX_SAMPLE_ROWS } from '../constants';

/**
 * Initial state for the application.
 * All arrays are fresh instances to avoid shared mutable references.
 */
export const initialAppState: AppState = {
  fileInfo: null,
  summary: null,
  sampleRows: null,
  findings: [],
  candidates: [],
  riskScore: null,
  enrichment: null,
  aiStatus: 'idle',
  analysisPhase: 'idle',
  error: null,
};

/**
 * Reducer that handles all application state transitions.
 * Uses the exact action types defined in AppAction.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, fileInfo: action.payload, error: null };

    case 'SET_SUMMARY':
      return { ...state, summary: action.payload };

    case 'SET_SAMPLE_ROWS':
      // Keep at most MAX_SAMPLE_ROWS rows in context — never store full CSV rows
      return {
        ...state,
        sampleRows: action.payload.slice(0, MAX_SAMPLE_ROWS),
      };

    case 'SET_FINDINGS':
      return { ...state, findings: action.payload };

    case 'SET_CANDIDATES':
      return { ...state, candidates: action.payload };

    case 'SET_RISK_SCORE':
      return { ...state, riskScore: action.payload };

    case 'SET_ENRICHMENT':
      return { ...state, enrichment: action.payload };

    case 'SET_AI_STATUS':
      return { ...state, aiStatus: action.payload };

    case 'SET_PHASE':
      return { ...state, analysisPhase: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'RESET':
      // Return a fresh initial state with new array references
      return {
        fileInfo: null,
        summary: null,
        sampleRows: null,
        findings: [],
        candidates: [],
        riskScore: null,
        enrichment: null,
        aiStatus: 'idle',
        analysisPhase: 'idle',
        error: null,
      };

    default:
      return state;
  }
}

/**
 * Context interface exposing state and dispatch.
 */
interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Provider component that wraps the application with app state.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to access the application context.
 * Throws a descriptive error in Spanish if used outside AppProvider.
 */
export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (context === null) {
    throw new Error(
      'useAppContext debe utilizarse dentro de un componente envuelto por AppProvider.'
    );
  }
  return context;
}
