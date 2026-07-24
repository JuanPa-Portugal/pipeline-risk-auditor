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
    // Clear previous error
    setError(null);
    dispatch({ type: 'SET_ERROR', payload: null });

    // Validate using AnalizadorCSV
    const validation = analizador.validateFile(file);
    if (!validation.valid) {
      const message = validation.error ?? 'Archivo inválido.';
      setError(message);
      dispatch({ type: 'SET_ERROR', payload: message });
      return;
    }

    // Dispatch file metadata to context
    dispatch({
      type: 'SET_FILE',
      payload: {
        name: file.name,
        size: file.size,
        loadedAt: new Date().toISOString(),
      },
    });

    // Execute the callback
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
    // Reset input to allow re-selecting the same file
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
    <div className="w-full max-w-lg mx-auto">
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
          w-full p-8 border-2 border-dashed rounded-lg
          transition-colors duration-200 cursor-pointer
          ${isDisabled ? 'opacity-50 cursor-not-allowed border-gray-300 bg-gray-50' : ''}
          ${isDragOver && !isDisabled ? 'border-blue-500 bg-blue-50' : ''}
          ${!isDragOver && !isDisabled ? 'border-gray-400 bg-white hover:border-blue-400 hover:bg-gray-50' : ''}
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600">Procesando archivo...</p>
          </div>
        ) : (
          <>
            <p className="text-base font-medium text-gray-700 mb-1">
              Arrastra un archivo CSV aquí
            </p>
            <p className="text-sm text-gray-500 mb-3">
              o haz clic para seleccionar
            </p>
            <p className="text-xs text-gray-400">
              Formato: CSV · Tamaño máximo: {maxSizeMB} MB
            </p>
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
