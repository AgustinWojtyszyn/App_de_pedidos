import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./index.ts', import.meta.url),
  'utf8'
)

describe('daily Igarreta + ISEMAR report contract', () => {
  it('uses the verified Marianela recipient and allows env override', () => {
    expect(source).toContain("IGARRETA_ISEMAR_REPORT_RECIPIENTS")
    expect(source).toContain("'marianelaborras@gmail.com'")
    expect(source).not.toContain("'mborras@imasa.com.ar'")
  })

  it('keeps the emailed ServiFood detail sheet lean and operational', () => {
    const detailsStart = source.indexOf("const details = workbook.addWorksheet('Pedidos Detallados')")
    const commentsStart = source.indexOf("const comments = workbook.addWorksheet('Comentarios')")
    const detailsSource = source.slice(detailsStart, commentsStart)

    expect(detailsSource).toContain("header: 'Cliente'")
    expect(detailsSource).toContain("header: 'Ubicación / empresa'")
    expect(detailsSource).toContain("header: 'Turno / servicio'")
    expect(detailsSource).toContain("header: 'Menú elegido'")
    expect(detailsSource).toContain("header: 'Guarniciones'")
    expect(detailsSource).toContain("header: 'Bebidas'")
    expect(detailsSource).toContain("header: 'Postres'")
    expect(detailsSource).not.toContain("header: 'Email'")
    expect(detailsSource).not.toContain("header: 'Organización'")
    expect(detailsSource).not.toContain("header: 'Lugar de entrega'")
    expect(detailsSource).not.toContain("header: 'Fecha de entrega'")
    expect(detailsSource).not.toContain("header: 'Origen'")
    expect(detailsSource).not.toContain("header: 'Comentarios'")
  })

  it('labels the combined report consistently', () => {
    expect(source).toContain('Reporte diario de consumo - Igarreta + ISEMAR')
    expect(source).toContain('Reporte diario de consumo Igarreta + ISEMAR -')
    expect(source).toContain('consumo_igarreta_isemar_')
  })
})
