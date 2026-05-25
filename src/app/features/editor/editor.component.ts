import { Component, ElementRef, ViewChild, inject, signal, effect, OnDestroy, Output, EventEmitter } from '@angular/core';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { FileSystemService } from '../../core/services/file-system.service';
import { BacklinksService } from '../../core/services/backlinks.service';

// 1. Diseño del Tema Oscuro HSL Adaptativo
const customTheme = EditorView.theme({
  "&": {
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    height: "100%",
    fontFamily: "var(--font-sans)",
    fontSize: "15px"
  },
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-content": {
    caretColor: "var(--accent-color)",
    padding: "0",
    lineHeight: "1.8"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent-color)",
    borderLeftWidth: "2px"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-glow) !important"
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    border: "none",
    paddingRight: "16px",
    userSelect: "none"
  },
  ".cm-activeLineGutter": {
    color: "var(--text-secondary)",
    backgroundColor: "transparent"
  },
  ".cm-activeLine": {
    backgroundColor: "hsla(220, 15%, 15%, 0.3)"
  }
}, { dark: true });

// 2. Definición Estricta de Estilos de Sintaxis Markdown
const customHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.6em", fontWeight: "700", color: "var(--text-primary)", margin: "16px 0 8px 0" },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "700", color: "var(--text-primary)", margin: "14px 0 8px 0" },
  { tag: t.heading3, fontSize: "1.2em", fontWeight: "600", color: "var(--text-primary)", margin: "12px 0 6px 0" },
  { tag: t.strong, fontWeight: "700", color: "var(--text-primary)" },
  { tag: t.emphasis, fontStyle: "italic", color: "var(--text-secondary)" },
  { tag: t.link, color: "var(--accent-color)", textDecoration: "underline" },
  { tag: t.url, color: "var(--text-muted)" },
  { tag: t.keyword, color: "hsl(280, 80%, 70%)" },
  { tag: t.comment, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: t.meta, color: "var(--text-muted)" }
]);

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.css'
})
export class EditorComponent implements OnDestroy {
  fileSystem = inject(FileSystemService);
  backlinksService = inject(BacklinksService);

  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  private editorView?: EditorView;
  private lastLoadedPath: string | null = null;
  private autoSaveTimeout: any = null;

  // Notificar al componente raíz sobre el estado de edición local
  @Output() isDirtyChange = new EventEmitter<boolean>();

  constructor() {
    // Escuchar reactivamente los cambios del archivo activo en el FileSystemService
    effect(() => {
      const activePath = this.fileSystem.activeFilePath();
      const diskContent = this.fileSystem.activeFileContent() || '';

      // Si el editor está listo y cambiamos de archivo, reiniciamos el estado
      if (this.editorView && this.lastLoadedPath !== activePath) {
        this.lastLoadedPath = activePath;
        
        // Limpiamos timeouts pendientes del archivo anterior
        if (this.autoSaveTimeout) {
          clearTimeout(this.autoSaveTimeout);
        }

        const state = this.createEditorState(diskContent);
        this.editorView.setState(state);
        this.isDirtyChange.emit(false);
      }
    });
  }

  ngAfterViewInit(): void {
    // Inicializar CodeMirror al renderizar la vista
    const initialContent = this.fileSystem.activeFileContent() || '';
    this.lastLoadedPath = this.fileSystem.activeFilePath();
    
    const state = this.createEditorState(initialContent);
    this.editorView = new EditorView({
      state,
      parent: this.editorContainer.nativeElement
    });
  }

  // Generar la configuración de estado de CodeMirror 6
  private createEditorState(content: string): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        customTheme,
        syntaxHighlighting(customHighlightStyle),
        // Manejador de eventos para clics interactivos en enlaces [[Backlinks]]
        EditorView.domEventHandlers({
          click: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos == null) return;
            
            const line = view.state.doc.lineAt(pos);
            const text = line.text;
            const relPos = pos - line.from;
            
            let start = 0;
            while (true) {
              const lBracket = text.indexOf('[[', start);
              if (lBracket === -1) break;
              const rBracket = text.indexOf(']]', lBracket);
              if (rBracket === -1) break;
              
              if (relPos >= lBracket && relPos <= rBracket + 2) {
                const linkContent = text.substring(lBracket + 2, rBracket);
                const target = linkContent.split('|')[0].trim();
                if (target) {
                  this.openOrCreateNote(target);
                  event.preventDefault();
                }
                break;
              }
              start = rBracket + 2;
            }
          }
        }),
        // Listener reactivo que captura solo la escritura real del usuario
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const isUserEvent = update.transactions.some(tr => tr.annotation(Transaction.userEvent));
            if (isUserEvent) {
              const currentContent = update.state.doc.toString();
              this.handleUserEdit(currentContent);
            }
          }
        })
      ]
    });
  }

  // Gestionar el búfer de cambios y el auto-guardado debounced (1 segundo)
  private handleUserEdit(newContent: string): void {
    this.isDirtyChange.emit(true);

    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(async () => {
      await this.fileSystem.saveActiveFile(newContent);
      this.isDirtyChange.emit(false);

      const activePath = this.fileSystem.activeFilePath();
      if (activePath) {
        await this.backlinksService.onFileEdited(activePath);
      }
    }, 1000);
  }

  // Resolver un enlace [[Nota]] abriéndola si existe, o creándola físicamente si es nota fantasma
  async openOrCreateNote(targetName: string): Promise<void> {
    const nodes = this.backlinksService.graphData().nodes;
    const lowercaseTarget = targetName.toLowerCase();
    
    const foundNode = nodes.find(n => n.id.toLowerCase() === lowercaseTarget);
    
    if (foundNode && foundNode.exists && foundNode.path) {
      await this.fileSystem.openFile(foundNode.path);
    } else {
      const vaultPath = this.fileSystem.currentVaultPath();
      if (vaultPath) {
        await this.fileSystem.createFile(vaultPath, targetName);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.editorView) {
      this.editorView.destroy();
    }
  }
}
