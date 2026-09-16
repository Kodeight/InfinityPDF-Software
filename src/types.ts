
import React from 'react';

export type ToolId = 'multi_pdf' | 'permissions' | 'universal'
  | 'pdf_organizer' | 'pdf_compressor' | 'pdf_to_images' | 'images_to_pdf'
  | 'pdf_to_text' | 'pdf_info' | 'pdf_to_word' | 'pdf_to_excel'
  | 'pdf_image_extractor' | 'pdf_table_extractor' | 'pdf_editor' | 'pdf_crop'
  | 'pdf_snapshot' | 'pdf_flatten' | 'pdf_ocr' | 'scan_to_pdf'
  | 'pdf_blank_page_remover' | 'certificate_generator' | 'batch_pdf_renamer'
  | 'pdf_signer' | 'pdf_forms' | 'pdf_metadata_cleaner' | 'pdf_redaction'
  | 'pdf_repair' | 'pdf_measurement';

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  icon: React.ReactNode;
  // Additive-expansion fields (optional; existing tools omit them).
  category?: string;
  hideFromNav?: boolean;
}

export interface LogMessage {
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}

export interface ToolState {
  progress: number;
  isProcessing: boolean;
  logs: LogMessage[];
  completed: boolean;
}

export interface WatermarkOptions {
  enabled?: boolean;
  rotation: number;
  fontSize: number;
  opacity: number;
  posX: number;
  posY: number;
  customWatermarkText?: string;
}

export interface PDFPermissions {
  print: boolean;
  copy: boolean;
  edit: boolean;
  restructure: boolean;
  forms: boolean;
  comments: boolean;
}
