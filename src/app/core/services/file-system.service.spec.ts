import { TestBed } from '@angular/core/testing';
import { FileSystemService } from './file-system.service';

describe('FileSystemService', () => {
  let service: FileSystemService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileSystemService);
  });

  it('debería inicializarse correctamente con estados por defecto', () => {
    expect(service).toBeTruthy();
    expect(service.currentVaultPath()).toBeNull();
    expect(service.activeFilePath()).toBeNull();
    expect(service.activeFileContent()).toBeNull();
    expect(service.isLoading()).toBeFalse();
    expect(service.error()).toBeNull();
    expect(service.activeView()).toBe('editor');
  });

  describe('Comparación y Normalización de Rutas (Compatibilidad con Windows)', () => {
    it('debería comparar rutas correctamente ignorando las diferencias de separadores', () => {
      const pathWindows = 'C:\\Boveda\\Carpeta\\Nota.md';
      const pathWeb = 'C:/Boveda/Carpeta/Nota.md';

      // Simular comparación manual que se realiza en el explorador
      const normalizedWin = pathWindows.replace(/\\/g, '/');
      const normalizedWeb = pathWeb.replace(/\\/g, '/');

      expect(normalizedWin).toBe(normalizedWeb);
      expect(normalizedWin).toBe('C:/Boveda/Carpeta/Nota.md');
    });

    it('debería manejar correctamente rutas con múltiples mezclas de separadores', () => {
      const pathMixed = 'C:\\Boveda/Carpeta\\Subcarpeta/Nota.md';
      const expected = 'C:/Boveda/Carpeta/Subcarpeta/Nota.md';

      const result = pathMixed.replace(/\\/g, '/');
      expect(result).toBe(expected);
    });
  });

  describe('Lógica Reactiva de Signals', () => {
    it('debería actualizar reactivamente la vista activa', () => {
      service.activeView.set('graph');
      expect(service.activeView()).toBe('graph');

      service.activeView.set('editor');
      expect(service.activeView()).toBe('editor');
    });

    it('debería actualizar reactivamente el archivo activo', () => {
      const mockPath = 'C:/vault/Note.md';
      service.activeFilePath.set(mockPath);
      expect(service.activeFilePath()).toBe(mockPath);
    });
  });
});
