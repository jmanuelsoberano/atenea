import { Injectable, inject, signal, effect } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { FileSystemService } from './file-system.service';

export interface Backlink {
  name: string;
  path: string;
}

export interface GraphNode {
  id: string;
  path: string | null;
  exists: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

@Injectable({
  providedIn: 'root'
})
export class BacklinksService {
  private fileSystem = inject(FileSystemService);

  // Signals reactivas para los backlinks y el grafo
  activeBacklinks = signal<Backlink[]>([]);
  graphData = signal<GraphData>({ nodes: [], links: [] });
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  constructor() {
    // 1. Escuchar cuando cambia la Bóveda activa para re-indexar por completo
    effect(async () => {
      const vaultPath = this.fileSystem.currentVaultPath();
      if (vaultPath) {
        await this.indexVault(vaultPath);
      } else {
        this.activeBacklinks.set([]);
        this.graphData.set({ nodes: [], links: [] });
      }
    });

    // 2. Escuchar cuando cambia el archivo activo para cargar sus backlinks correspondientes
    effect(async () => {
      const activePath = this.fileSystem.activeFilePath();
      if (activePath) {
        await this.refreshBacklinks(activePath);
      } else {
        this.activeBacklinks.set([]);
      }
    });
  }

  // Indexación inicial completa de la bóveda
  async indexVault(vaultPath: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      await invoke<void>('index_vault', { path: vaultPath });
      await this.refreshGraphData();
      
      // Si ya hay un archivo activo cargado, actualizamos sus backlinks
      const activePath = this.fileSystem.activeFilePath();
      if (activePath) {
        await this.refreshBacklinks(activePath);
      }
    } catch (err: any) {
      this.error.set(err.toString());
    } finally {
      this.isLoading.set(false);
    }
  }

  // Recargar la lista de backlinks del archivo activo actual
  async refreshBacklinks(filePath: string): Promise<void> {
    try {
      const list = await invoke<Backlink[]>('get_backlinks', { path: filePath });
      this.activeBacklinks.set(list);
    } catch (err: any) {
      console.error("Error al obtener backlinks:", err);
    }
  }

  // Recargar la estructura del grafo en tiempo real
  async refreshGraphData(): Promise<void> {
    try {
      const data = await invoke<GraphData>('get_graph_data');
      this.graphData.set(data);
    } catch (err: any) {
      console.error("Error al obtener datos del grafo:", err);
    }
  }

  // Se ejecuta de forma incremental cuando se edita y guarda una sola nota
  async onFileEdited(filePath: string): Promise<void> {
    try {
      // Re-analizar nota en Rust
      await invoke<void>('update_file_index', { path: filePath });
      // Refrescar el grafo e indexado local
      await this.refreshGraphData();
      
      // Si la nota guardada es la que está activa actualmente en pantalla, actualizamos
      const activePath = this.fileSystem.activeFilePath();
      if (activePath === filePath) {
        await this.refreshBacklinks(filePath);
      }
    } catch (err: any) {
      console.error("Error en la indexación incremental:", err);
    }
  }
}
