import { useState, useRef, useCallback } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { AnalizadorCSV } from '../modules/analizador-csv';
import { MAX_FILE_SIZE } from '../constants';
import { useAppContext } from '../context/AppContext';

export interface FileUploaderProps {
  onFileAccepted: (file: File) => void | Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}

const analizador = new AnalizadorCSV();
const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);

export function FileUploader({ onFileAccepted, isLoading = false, disabled = false }: FileUploaderProps) {
  const { dispatch } = useAppContext();
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDisabled = disabled || isLoading;

  const processFile = useCallback(async (file: File) => {
    setError(null);
    dispatch({ type: 'SET_ERROR', payload: null });

    const validation = analizador.validateFile(file);
    if (!validation.valid) {
      const message = validation.error ?? 'Archivo inválido.';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return;
    }

    dispatch({
      type: 'SET_FILE',
      payload: {
        name: file.name,
        size: file.size,
        loadedAt: new Date().toISOString(),
      },
    });

    try {
      await onFileAccepted(file);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Ocurrió un error al procesar el archivo.';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [onFileAccepted, dispatch]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void processFile(files[0]!);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) {
      setIsDragOver(true);
    }
  }, [isDisabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isDisabled) return;

    const files = e.dataTransfer.files;

    if (files.length > 1) {
      const message = 'Solo se admite un archivo por vez.';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return;
    }

    if (files.length === 1) {
      void processFile(files[0]!);
    }
  }, [isDisabled, processFile, dispatch]);

  const handleButtonClick = useCallback(() => {
    if (!isDisabled && inputRef.current) {
      inputRef.current.click();
    }
  }, [isDisabled]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleButtonClick();
    }
  }, [handleButtonClick]);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleButtonClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled}
        aria-label="Zona de carga de archivo CSV"
        className={`
          relative flex flex-col items-center justify-center
          w-full py-12 px-6 border-2 border-dashed rounded-xl
          shadow-sm cursor-pointer
          transition-all duration-200
          ${isDisabled ? 'opacity-50 cursor-not-allowed border-gray-300 bg-gray-50' : ''}
          ${isDragOver && !isDisabled ? 'border-cyan-500 bg-cyan-50 shadow-md scale-[1.01]' : ''}
          ${!isDragOver && !isDisabled ? 'border-[#1e3a5f]/30 bg-white hover:border-cyan-400 hover:bg-cyan-50/30 hover:shadow-md' : ''}
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Procesando archivo...</p>
          </div>
        ) : (
          <>
            {/* Upload icon */}
            <svg className="w-12 h-12 text-[#1e3a5f]/60 mb-4" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M24 6v24M16 14l8-8 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 32v6a4 4 0 004 4h24a4 4 0 004-4v-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p className="text-base font-semibold text-[#1e3a5f] mb-1">
              Arrastra un archivo CSV aquí
            </p>
            <p className="text-sm text-gray-500 mb-4">
              o haz clic para <span className="font-medium text-cyan-700 underline underline-offset-2">seleccionar archivo</span>
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded">CSV UTF-8</span>
              <span className="px-2 py-1 bg-gray-100 rounded">Máximo {maxSizeMB} MB</span>
              <span className="px-2 py-1 bg-gray-100 rounded">Análisis local y seguro</span>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        disabled={isDisabled}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {error && (
        <div
          role="alert"
          className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md"
        >
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
