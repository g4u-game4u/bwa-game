import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

export interface Anexo {
  id: string;
  filename: string;
  original_name: string;
  size: number;
  mime_type: string;
  created_at: string;
  url?: string;
}

@Component({
  selector: 'app-upload-anexos',
  templateUrl: './upload-anexos.component.html',
  styleUrls: ['./upload-anexos.component.scss']
})
export class UploadAnexosComponent implements OnInit {
  @Input() userActionId: string = '';
  @Input() maxArquivos: number = 5;
  @Input() maxTamanhoArquivo: number = 10 * 1024 * 1024; // 10MB
  @Input() aliases: any;

  @Output() uploadConcluido = new EventEmitter<void>();
  @Output() downloadIniciado = new EventEmitter<string>();

  // Propriedades para upload de arquivos
  arquivosSelecionados: File[] = [];
  
  // Propriedades para anexos existentes
  anexosExistentes: Anexo[] = [];
  loadingAnexos = false;
  downloadingAnexos: Set<string> = new Set();

  // Estados de upload
  fazendoUpload = false;
  progressoUpload = 0;

  constructor() {}

  ngOnInit() {
    if (this.userActionId) {
      this.carregarAnexos();
    }
  }

  // ===== MÉTODOS DE UPLOAD =====

  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    this.processarArquivos(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.dataTransfer?.files) {
      this.processarArquivos(event.dataTransfer.files);
    }
  }

  processarArquivos(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (this.arquivosSelecionados.length >= this.maxArquivos) {
                break;
      }

      if (this.arquivosSelecionados.some(f => f.name === file.name && f.size === file.size)) {
                continue;
      }

      if (file.size > this.maxTamanhoArquivo) {
                continue;
      }

      if (!this.isTipoArquivoValido(file)) {
                continue;
      }

      this.arquivosSelecionados.push(file);
    }
  }

  removerArquivo(index: number): void {
    if (index >= 0 && index < this.arquivosSelecionados.length) {
      this.arquivosSelecionados.splice(index, 1);
    }
  }

  removerTodosArquivos(): void {
    this.arquivosSelecionados = [];
  }

  async fazerUpload(): Promise<void> {
    if (!this.userActionId || this.arquivosSelecionados.length === 0) {
            return;
    }

    this.fazendoUpload = true;
    this.progressoUpload = 0;

    try {
            // Simular progresso (em uma implementação real, você usaria um Observable)
      const interval = setInterval(() => {
        this.progressoUpload += 10;
        if (this.progressoUpload >= 90) {
          clearInterval(interval);
        }
      }, 100);

      // Aqui você faria a chamada real para o serviço
      // await this.pontosAvulsosService.uploadAnexos(this.userActionId, this.arquivosSelecionados);
      
      // Simular delay do upload
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(interval);
      this.progressoUpload = 100;

            // Recarregar anexos após upload
      await this.carregarAnexos();
      
      // Limpar arquivos selecionados
      this.removerTodosArquivos();
      
      // Emitir evento de conclusão
      this.uploadConcluido.emit();
      
    } catch (error: any) {
          } finally {
      this.fazendoUpload = false;
      this.progressoUpload = 0;
    }
  }

  // ===== MÉTODOS DE DOWNLOAD =====

  async fazerDownloadAnexo(anexo: Anexo): Promise<void> {
    if (!anexo?.id) {
            return;
    }

    if (this.downloadingAnexos.has(anexo.id)) {
      return;
    }

    this.downloadingAnexos.add(anexo.id);
    this.downloadIniciado.emit(anexo.id);

    try {
            // Aqui você faria a chamada real para o serviço
      // const downloadUrl = await this.pontosAvulsosService.getDownloadUrl(anexo.id);
      
      // Simular delay do download
      await new Promise(resolve => setTimeout(resolve, 1000));
      
          } catch (error: any) {
          } finally {
      this.downloadingAnexos.delete(anexo.id);
    }
  }

  // ===== MÉTODOS AUXILIARES =====

  private async carregarAnexos(): Promise<void> {
    try {
      this.loadingAnexos = true;
            // Aqui você faria a chamada real para o serviço
      // const response = await this.pontosAvulsosService.buscarAnexos(this.userActionId);
      
      // Simular dados de anexos
      this.anexosExistentes = [
        {
          id: '1',
          filename: 'documento.pdf',
          original_name: 'Relatório Mensal.pdf',
          size: 1024000,
          mime_type: 'application/pdf',
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          filename: 'imagem.jpg',
          original_name: 'Screenshot.png',
          size: 512000,
          mime_type: 'image/png',
          created_at: new Date().toISOString()
        }
      ];
      
          } catch (error) {
            this.anexosExistentes = [];
    } finally {
      this.loadingAnexos = false;
    }
  }

  isTipoArquivoValido(file: File): boolean {
    const tiposValidos = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'video/mp4',
      'video/avi',
      'video/quicktime'
    ];

    return tiposValidos.includes(file.type);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getDownloadTooltip(anexo: Anexo): string {
    const fileName = anexo.original_name || anexo.filename || 'arquivo';
    const mimeType = anexo.mime_type || '';
    
    if (this.isImageFile(mimeType, fileName)) {
      return `Visualizar ${fileName} (abre em nova aba)`;
    } else {
      return `Baixar ${fileName} (preserva formato original)`;
    }
  }

  private isImageFile(mimeType: string, fileName: string): boolean {
    const imageMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
      'image/webp', 'image/svg+xml', 'image/tiff', 'image/tif'
    ];
    
    if (imageMimeTypes.includes(mimeType)) {
      return true;
    }
    
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    return extension ? imageExtensions.includes('.' + extension) : false;
  }

  // ===== MÉTODOS DE CONTROLE DE ESTADO =====

  podeFazerUpload(): boolean {
    return this.arquivosSelecionados.length > 0 && !this.fazendoUpload;
  }

  podeLimparArquivos(): boolean {
    return this.arquivosSelecionados.length > 0 && !this.fazendoUpload;
  }

  getProgressoUpload(): number {
    return this.progressoUpload;
  }

  getProgressoUploadTexto(): string {
    return `${this.progressoUpload}%`;
  }
} 
