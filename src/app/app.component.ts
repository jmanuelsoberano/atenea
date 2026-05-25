import { Component, inject, signal, ViewChild } from "@angular/core";
import { FileSystemService } from "./core/services/file-system.service";
import { ExplorerComponent } from "./features/explorer/explorer.component";
import { EditorComponent } from "./features/editor/editor.component";
import { BacklinksPanelComponent } from "./features/backlinks/backlinks-panel.component";
import { GraphComponent } from "./features/graph/graph.component";

@Component({
  selector: "app-root",
  imports: [ExplorerComponent, EditorComponent, BacklinksPanelComponent, GraphComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  fileSystem = inject(FileSystemService);

  @ViewChild(ExplorerComponent) explorerRef!: ExplorerComponent;

  // Alternancia de vista en el panel central: 'editor' o 'graph'
  activeView = signal<'editor' | 'graph'>('editor');

  // Estado de cambios sin guardar recibido desde el editor
  isDirty = signal<boolean>(false);

  get activeFileName(): string {
    const path = this.fileSystem.activeFilePath();
    if (!path) return "";
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }
}
