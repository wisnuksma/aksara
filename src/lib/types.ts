export type Template = 'kosong' | 'tiga-babak' | 'fantasi-epik'

export type SceneStatus = 'ide' | 'draf' | 'revisi' | 'selesai'

/** Isi project.json */
export interface ProjectFile {
  format: 1
  id: string
  judul: string
  genre: string
  target_kata: number
  target_harian: number
  template: Template
  dibuat: string
  /** Urutan binder: folder bab beserta urutan file adegannya. */
  binder: { bab: string; adegan: string[] }[]
  setting: Record<string, unknown>
}
