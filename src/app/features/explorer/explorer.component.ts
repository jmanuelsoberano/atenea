import { Component, inject, signal, computed, effect } from '@angular/core';
import { NgTemplateOutlet, SlicePipe } from '@angular/common';
import { FileSystemService } from '../../core/services/file-system.service';
import { FileNode } from '../../core/models/file-node.model';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [NgTemplateOutlet, SlicePipe],
  templateUrl: './explorer.component.html',
  styleUrl: './explorer.component.css'
})
export class ExplorerComponent {
  fileSystem = inject(FileSystemService);

  get vaultName(): string {
    const path = this.fileSystem.currentVaultPath();
    if (!path) return '';
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  // Set reactivo para carpetas expandidas
  expandedPaths = signal<Set<string>>(new Set<string>());

  constructor() {
    // Escuchar reactivamente cambios en el archivo activo para revelarlo en el árbol
    effect(() => {
      const activePath = this.fileSystem.activeFilePath();
      const vaultPath = this.fileSystem.currentVaultPath();
      if (activePath && vaultPath) {
        this.revealPathInTree(activePath, vaultPath);
      }
    }, { allowSignalWrites: true });
  }

  // Revela un archivo específico expandiendo todas las carpetas ancestras
  private revealPathInTree(activePath: string, vaultPath: string): void {
    const current = new Set(this.expandedPaths());
    const normalizedActive = activePath.replace(/\\/g, '/');
    const normalizedVault = vaultPath.replace(/\\/g, '/');
    
    if (normalizedActive.startsWith(normalizedVault)) {
      const parts = normalizedActive.substring(normalizedVault.length).split('/');
      let accumulated = normalizedVault;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part) {
          accumulated += '/' + part;
          const originalAccumulated = accumulated.replace(/\//g, activePath.includes('\\') ? '\\' : '/');
          current.add(originalAccumulated);
        }
      }
      this.expandedPaths.set(current);
    }
  }

  // Consulta de búsqueda en tiempo real
  searchQuery = signal<string>('');

  // Filtrado reactivo recursivo del árbol de archivos
  filteredFiles = computed<FileNode[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const originalFiles = this.fileSystem.files();

    if (!query) {
      return originalFiles;
    }

    const filterTree = (nodes: FileNode[]): FileNode[] => {
      const result: FileNode[] = [];
      for (const node of nodes) {
        if (node.isDir) {
          const filteredChildren = filterTree(node.children);
          if (node.name.toLowerCase().includes(query) || filteredChildren.length > 0) {
            result.push({
              ...node,
              children: filteredChildren
            });
          }
        } else if (node.name.toLowerCase().includes(query)) {
          result.push(node);
        }
      }
      return result;
    };

    return filterTree(originalFiles);
  });

  // Estado para creación/edición rápida
  activePrompt = signal<{ type: 'file' | 'folder' | 'rename'; path: string } | null>(null);
  promptInput = signal<string>('');

  toggleFolder(path: string): void {
    const current = new Set(this.expandedPaths());
    if (current.has(path)) {
      current.delete(path);
    } else {
      current.add(path);
    }
    this.expandedPaths.set(current);
  }

  isExpanded(path: string): boolean {
    if (this.searchQuery().trim()) {
      return true; // Auto-expandir todo para mostrar los resultados de búsqueda
    }
    return this.expandedPaths().has(path);
  }

  onFileClick(path: string): void {
    this.fileSystem.openFile(path);
  }

  openPrompt(type: 'file' | 'folder' | 'rename', path: string, currentValue: string = ''): void {
    this.activePrompt.set({ type, path });
    this.promptInput.set(currentValue);
  }

  closePrompt(): void {
    this.activePrompt.set(null);
    this.promptInput.set('');
  }

  async handlePromptSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const prompt = this.activePrompt();
    const value = this.promptInput().trim();
    if (!prompt || !value) return;

    try {
      if (prompt.type === 'file') {
        await this.fileSystem.createFile(prompt.path, value);
      } else if (prompt.type === 'folder') {
        await this.fileSystem.createDirectory(prompt.path, value);
        // Expandimos la carpeta padre para que sea visible la nueva
        const current = new Set(this.expandedPaths());
        current.add(prompt.path);
        this.expandedPaths.set(current);
      } else if (prompt.type === 'rename') {
        await this.fileSystem.renameItem(prompt.path, value);
      }
    } finally {
      this.closePrompt();
    }
  }

  async deleteItem(path: string, name: string): Promise<void> {
    if (confirm(`¿Estás seguro de que deseas eliminar "${name}"?`)) {
      await this.fileSystem.deleteItem(path);
    }
  }
}
