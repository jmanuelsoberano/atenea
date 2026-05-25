import { Component, ElementRef, ViewChild, inject, effect, OnDestroy, AfterViewInit, ViewEncapsulation } from '@angular/core';
import * as d3 from 'd3';
import { BacklinksService, GraphNode, GraphEdge } from '../../core/services/backlinks.service';
import { FileSystemService } from '../../core/services/file-system.service';

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  path: string | null;
  exists: boolean;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
}

@Component({
  selector: 'app-graph',
  standalone: true,
  templateUrl: './graph.component.html',
  styleUrl: './graph.component.css',
  encapsulation: ViewEncapsulation.None
})
export class GraphComponent implements AfterViewInit, OnDestroy {
  backlinksService = inject(BacklinksService);
  fileSystem = inject(FileSystemService);

  @ViewChild('svgContainer', { static: true }) svgContainer!: ElementRef<SVGSVGElement>;

  private simulation?: d3.Simulation<D3Node, D3Link>;
  private svgSelection?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gContainer?: d3.Selection<SVGGElement, unknown, null, undefined>;
  private selectedNodeId: string | null = null;

  constructor() {
    // Escuchar cambios reactivos en los datos del grafo
    effect(() => {
      const data = this.backlinksService.graphData();
      if (this.svgSelection && data.nodes.length > 0) {
        this.updateGraph(data.nodes, data.links);
      }
    });
  }

  ngAfterViewInit(): void {
    const svgEl = this.svgContainer.nativeElement;
    this.svgSelection = d3.select(svgEl);
    
    // Crear el contenedor principal para soportar zoom y pan
    this.gContainer = this.svgSelection.append('g').attr('class', 'graph-content');
    
    // Configurar Zoom & Paneo
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        this.gContainer?.attr('transform', event.transform);
      });
      
    this.svgSelection.call(zoom);

    // Clic en el fondo para limpiar la selección fija
    this.svgSelection.on('click', (event) => {
      const isNodeClick = event.target.closest('.node-group');
      if (!isNodeClick) {
        this.selectedNodeId = null;
        this.svgSelection?.selectAll('.node-group').style('opacity', 1.0);
        this.svgSelection?.selectAll('.circle-node').classed('selected', false);
        this.svgSelection?.selectAll('.text-node').classed('selected', false);
        this.svgSelection?.selectAll('.link-line')
          .style('stroke-opacity', 0.5)
          .style('stroke', 'hsl(220, 12%, 32%)')
          .style('stroke-width', '1.5px');
      }
    });

    // Si ya hay datos cargados en el servicio al iniciar, renderizar
    const initialData = this.backlinksService.graphData();
    if (initialData.nodes.length > 0) {
      this.updateGraph(initialData.nodes, initialData.links);
    }
  }

  private updateGraph(nodesData: GraphNode[], edgesData: GraphEdge[]): void {
    if (!this.svgSelection || !this.gContainer) return;

    this.selectedNodeId = null; // Limpiar selección fija en recarga

    // 1. Obtener dimensiones del lienzo responsivo
    const rect = this.svgContainer.nativeElement.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    // 2. Mapear datos a estructuras D3
    // Conservamos las posiciones previas de los nodos si ya existían para evitar saltos bruscos
    const prevNodes = this.simulation?.nodes() || [];
    const prevNodesMap = new Map(prevNodes.map(n => [n.id, n]));

    const nodes: D3Node[] = nodesData.map(node => {
      const prev = prevNodesMap.get(node.id);
      return {
        id: node.id,
        path: node.path,
        exists: node.exists,
        x: prev ? prev.x : width / 2 + (Math.random() - 0.5) * 50,
        y: prev ? prev.y : height / 2 + (Math.random() - 0.5) * 50,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0
      };
    });

    const links: D3Link[] = edgesData.map(edge => ({
      source: edge.source,
      target: edge.target
    }));

    // 3. Detener simulación previa
    if (this.simulation) {
      this.simulation.stop();
    }

    // 4. Limpiar SVG
    this.gContainer.selectAll('*').remove();

    // 5. Agregar definción de marcadores de flechas para las conexiones (aristas)
    const defs = this.svgSelection.select('defs');
    const defsSelection = defs.empty() ? this.svgSelection.append('defs') : defs;
    (defsSelection as any).html('');
    
    // Filtro glow neon para el nodo activo
    defsSelection.append('filter')
      .attr('id', 'glow-active')
      .append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');

    // 6. Renderizar aristas (líneas)
    const link = this.gContainer.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link-line');

    // 7. Renderizar nodos (grupos G)
    const nodeG = this.gContainer.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .call(this.setupDragBehavior());

    // Círculos del nodo
    nodeG.append('circle')
      .attr('r', d => (d.path && d.path === this.fileSystem.activeFilePath()) ? 10 : 7)
      .attr('class', d => {
        if (d.path && d.path === this.fileSystem.activeFilePath()) return 'circle-node active';
        return d.exists ? 'circle-node physical' : 'circle-node ghost';
      });

    // Etiquetas de texto
    nodeG.append('text')
      .text(d => d.id)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('class', d => (d.path && d.path === this.fileSystem.activeFilePath()) ? 'text-node active' : 'text-node');

    // Funciones internas auxiliares para resaltar e indexar relaciones mediante cierres (closures)
    const resetHighlight = () => {
      nodeG.style('opacity', 1.0);
      link
        .style('stroke-opacity', 0.5)
        .style('stroke', 'hsl(220, 12%, 32%)')
        .style('stroke-width', '1.5px');
    };

    const applyHighlight = (hoveredNode: D3Node) => {
      const connectedNodeIds = new Set<string>();
      connectedNodeIds.add(hoveredNode.id);
      
      links.forEach(l => {
        const sourceId = (l.source as D3Node).id;
        const targetId = (l.target as D3Node).id;
        if (sourceId === hoveredNode.id) {
          connectedNodeIds.add(targetId);
        } else if (targetId === hoveredNode.id) {
          connectedNodeIds.add(sourceId);
        }
      });

      // Atenuar nodos no conectados
      nodeG.style('opacity', d => connectedNodeIds.has(d.id) ? 1.0 : 0.15);
      
      // Resaltar conexiones correspondientes
      link
        .style('stroke-opacity', l => {
          const sourceId = (l.source as D3Node).id;
          const targetId = (l.target as D3Node).id;
          return (sourceId === hoveredNode.id || targetId === hoveredNode.id) ? 1.0 : 0.05;
        })
        .style('stroke', l => {
          const sourceId = (l.source as D3Node).id;
          const targetId = (l.target as D3Node).id;
          return (sourceId === hoveredNode.id || targetId === hoveredNode.id) ? 'var(--accent-color)' : 'hsl(220, 12%, 32%)';
        })
        .style('stroke-width', l => {
          const sourceId = (l.source as D3Node).id;
          const targetId = (l.target as D3Node).id;
          return (sourceId === hoveredNode.id || targetId === hoveredNode.id) ? '2.5px' : '1.5px';
        });
    };

    // Doble clic para abrir/crear la nota
    nodeG.on('dblclick', async (event, d) => {
      event.preventDefault();
      await this.openOrCreateNote(d);
    });

    // Clic simple para seleccionar y bloquear (pin) el resaltado de relaciones
    nodeG.on('click', (event, clickedNode) => {
      event.stopPropagation(); // Evitar propagación del click al fondo
      
      if (this.selectedNodeId === clickedNode.id) {
        // Deseleccionar si ya estaba seleccionado
        this.selectedNodeId = null;
        resetHighlight();
        nodeG.selectAll('circle').classed('selected', false);
        nodeG.selectAll('text').classed('selected', false);
      } else {
        // Seleccionar y bloquear el resaltado
        this.selectedNodeId = clickedNode.id;
        applyHighlight(clickedNode);
        nodeG.selectAll('circle').classed('selected', (d: any) => d && d.id === clickedNode.id);
        nodeG.selectAll('text').classed('selected', (d: any) => d && d.id === clickedNode.id);
      }
    });

    // Interactividad de Hover: solo activa si no hay una selección fija por clic
    nodeG.on('mouseenter', (event, hoveredNode) => {
      if (this.selectedNodeId) return;
      applyHighlight(hoveredNode);
    });

    nodeG.on('mouseleave', () => {
      if (this.selectedNodeId) return;
      resetHighlight();
    });

    // Hover tooltip rápido
    nodeG.append('title')
      .text(d => `${d.id} ${d.exists ? '' : '(Nota fantasma)'}`);

    // 8. Inicializar la Simulación Física
    this.simulation = d3.forceSimulation<D3Node>(nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))
      .on('tick', () => {
        link
          .attr('x1', d => (d.source as D3Node).x || 0)
          .attr('y1', d => (d.source as D3Node).y || 0)
          .attr('x2', d => (d.target as D3Node).x || 0)
          .attr('y2', d => (d.target as D3Node).y || 0);

        nodeG.attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
      });

    this.simulation.alpha(0.5).restart();
  }

  // Comportamiento de Arrastre de Nodos (Drag and Drop)
  private setupDragBehavior(): d3.DragBehavior<SVGGElement, D3Node, D3Node | d3.SubjectPosition> {
    return d3.drag<SVGGElement, D3Node>()
      .on('start', (event, d) => {
        if (!event.active) this.simulation?.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.simulation?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  // Doble clic para abrir o crear
  private async openOrCreateNote(node: D3Node): Promise<void> {
    if (node.exists && node.path) {
      await this.fileSystem.openFile(node.path);
      this.fileSystem.activeView.set('editor'); // Cambiar a vista editor
    } else {
      const vaultPath = this.fileSystem.currentVaultPath();
      if (vaultPath) {
        await this.fileSystem.createFile(vaultPath, node.id);
        this.fileSystem.activeView.set('editor'); // Cambiar a vista editor
      }
    }
  }

  // Centrar el grafo en la pantalla
  centerGraph(): void {
    if (!this.svgSelection || !this.simulation) return;
    const rect = this.svgContainer.nativeElement.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    const zoom = d3.zoom<SVGSVGElement, unknown>();
    this.svgSelection.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
    
    this.simulation.alpha(0.3).restart();
  }

  ngOnDestroy(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
  }
}
