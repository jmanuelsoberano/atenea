import { Component, inject, signal } from '@angular/core';
import { BacklinksService } from '../../core/services/backlinks.service';
import { FileSystemService } from '../../core/services/file-system.service';

@Component({
  selector: 'app-backlinks-panel',
  standalone: true,
  templateUrl: './backlinks-panel.component.html',
  styleUrl: './backlinks-panel.component.css'
})
export class BacklinksPanelComponent {
  backlinksService = inject(BacklinksService);
  fileSystem = inject(FileSystemService);

  // Estado colapsado del panel inferior
  isCollapsed = signal<boolean>(false);

  togglePanel(): void {
    this.isCollapsed.set(!this.isCollapsed());
  }

  async openBacklink(path: string): Promise<void> {
    await this.fileSystem.openFile(path);
  }
}
