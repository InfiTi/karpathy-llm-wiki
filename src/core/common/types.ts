export interface DeepMergeOptions {
  arrayMerge?: (target: any[], source: any[]) => any[];
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modified: Date;
}
