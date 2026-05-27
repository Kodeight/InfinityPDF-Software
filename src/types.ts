
import React from 'react';

export type ToolId = 'multi_pdf' | 'permissions' | 'universal';

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  icon: React.ReactNode;
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
}

export interface PDFPermissions {
  print: boolean;
  copy: boolean;
  edit: boolean;
  restructure: boolean;
  forms: boolean;
  comments: boolean;
}
