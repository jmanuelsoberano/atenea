import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { FileNode } from '../models/file-node.model';

@Injectable({
  providedIn: 'root'
})
export class FileSystemService {
  // Signals para el estado global del sistema de archivos local-first
  currentVaultPath = signal<string | null>(null);
  files = signal<FileNode[]>([]);
  activeFilePath = signal<string | null>(null);
  activeFileContent = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Seleccionar una carpeta del sistema de archivos local para usar como Bóveda
  async selectVault(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const selectedPath = await invoke<string | null>('select_directory');
      if (selectedPath) {
        this.currentVaultPath.set(selectedPath);
        await this.refreshFiles();
      }
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Refrescar recursivamente el árbol de archivos desde Rust
  async refreshFiles(): Promise<void> {
    const vaultPath = this.currentVaultPath();
    if (!vaultPath) return;

    this.isLoading.set(true);
    try {
      const tree = await invoke<FileNode[]>('read_directory', { path: vaultPath });
      this.files.set(tree);
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Abrir un archivo específico y cargar su contenido
  async openFile(path: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const content = await invoke<string>('read_file', { path });
      this.activeFilePath.set(path);
      this.activeFileContent.set(content);
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Guardar el contenido en el archivo activo actual
  async saveActiveFile(content: string): Promise<void> {
    const filePath = this.activeFilePath();
    if (!filePath) return;

    this.isLoading.set(true);
    this.error.set(null);
    try {
      await invoke<void>('write_file', { path: filePath, content });
      this.activeFileContent.set(content);
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Crear un nuevo archivo .md en una ruta dada (o en la raíz si no se proporciona)
  async createFile(parentPath: string, name: string): Promise<void> {
    const vaultPath = this.currentVaultPath();
    if (!vaultPath) return;

    const actualParent = parentPath || vaultPath;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const newFilePath = await invoke<string>('create_file', { parentPath: actualParent, name });
      await this.refreshFiles();
      await this.openFile(newFilePath);
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Crear una nueva carpeta
  async createDirectory(parentPath: string, name: string): Promise<void> {
    const vaultPath = this.currentVaultPath();
    if (!vaultPath) return;

    const actualParent = parentPath || vaultPath;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await invoke<string>('create_directory', { parentPath: actualParent, name });
      await this.refreshFiles();
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Renombrar archivo o carpeta
  async renameItem(path: string, newName: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const newPath = await invoke<string>('rename_item', { path, newName });
      
      // Si el elemento renombrado era el archivo activo, actualizamos su ruta
      if (this.activeFilePath() === path) {
        this.activeFilePath.set(newPath);
      }
      
      await this.refreshFiles();
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Eliminar un archivo o carpeta
  async deleteItem(path: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await invoke<void>('delete_item', { path });
      
      // Si el elemento eliminado era el archivo activo actual, limpiamos la selección
      if (this.activeFilePath() === path) {
        this.activeFilePath.set(null);
        this.activeFileContent.set(null);
      }
      
      await this.refreshFiles();
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }
}
