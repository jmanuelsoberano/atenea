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

  // Delegar la vista activa en la Signal global de FileSystemService
  activeView = this.fileSystem.activeView;

  // Estado de cambios sin guardar recibido desde el editor
  isDirty = signal<boolean>(false);

  // Ancho del panel lateral izquierdo con persistencia
  sidebarWidth = signal<number>(this.getInitialSidebarWidth());
  isResizing = signal<boolean>(false);

  private getInitialSidebarWidth(): number {
    const saved = localStorage.getItem("sidebarWidth");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) {
        if (parsed === 0 || (parsed >= 200 && parsed <= 480)) {
          return parsed;
        }
      }
    }
    return 260; // Ancho por defecto
  }

  onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing.set(true);

    const startX = event.clientX;
    const startWidth = this.sidebarWidth();

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isResizing()) return;
      const deltaX = moveEvent.clientX - startX;
      let newWidth = startWidth + deltaX;

      // Límites interactivos premium (efecto snap-collapse a 0px si < 100px)
      if (newWidth < 100) {
        newWidth = 0;
      } else if (newWidth < 200) {
        newWidth = 200;
      } else if (newWidth > 480) {
        newWidth = 480;
      }

      this.sidebarWidth.set(newWidth);
      localStorage.setItem("sidebarWidth", newWidth.toString());
    };

    const onMouseUp = () => {
      this.isResizing.set(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    // Prevenir selección molesta y mantener el cursor col-resize en todo el documento durante el arrastre
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  get activeFileName(): string {
    const path = this.fileSystem.activeFilePath();
    if (!path) return "";
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }
}
