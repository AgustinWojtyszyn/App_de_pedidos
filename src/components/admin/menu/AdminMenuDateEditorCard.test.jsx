import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminMenuDateEditorCard from './AdminMenuDateEditorCard'

const noop = () => {}

const rawGlobalMenu = [
  { id: 'main', name: 'Menú principal', description: 'MENÚ DEL DÍA' },
  { id: 'option-1', name: 'Opción 1', description: 'BIFE DE POLLO CON ARROZ' },
  { id: 'option-2', name: 'Opción 2', description: 'SORRENTINOS' },
  { id: 'option-3', name: 'Opción 3', description: 'TARTA DE ATÚN' },
  { id: 'hyper', name: 'Hiperproteica', description: 'OMELETTE DOBLE' },
  { id: 'option-4', name: 'Opción 4', description: 'BIFE DE CERDO' },
  { id: 'option-5', name: 'Opción 5', description: 'ENSALADA' },
  { id: 'option-6', name: 'Opción 6', description: 'CELÍACO' }
]

const renderCard = ({ editingMenu = false } = {}) =>
  renderToStaticMarkup(
    <AdminMenuDateEditorCard
      menuDate="2026-09-22"
      editingMenu={editingMenu}
      savingMenu={false}
      loadingMenu={false}
      menuItems={rawGlobalMenu}
      draftItems={rawGlobalMenu}
      dinnerMenuEnabled={false}
      onToggleDinnerMenu={noop}
      onEditMenu={noop}
      onSaveMenu={noop}
      onCancelMenu={noop}
      onMenuItemChange={noop}
      onAddMenuItem={noop}
      onRemoveMenuItem={noop}
      changeSummary={{ newItems: [], modifiedItems: [], deletedItems: [], hasChanges: false }}
      onPrimeSuccess={noop}
      companySlug="global"
    />
  )

const textBetween = (html, from, to) => {
  const start = html.indexOf(from)
  const end = html.indexOf(to, start + from.length)
  return start >= 0 && end >= 0 ? html.slice(start, end) : ''
}

describe('AdminMenuDateEditorCard global numbering', () => {
  it('shows Hiperproteica as option 4 and shifts Bife, Ensalada and Celíaco to 5, 6 and 7', () => {
    const html = renderCard()

    expect((html.match(/Opción 4/g) || [])).toHaveLength(1)
    expect(textBetween(html, 'Opción 5', 'Opción 6')).toContain('BIFE DE CERDO')
    expect(textBetween(html, 'Opción 6', 'Opción 7')).toContain('ENSALADA')
    expect(html.slice(html.indexOf('Opción 7'))).toContain('CELÍACO')
  })

  it('explains the visible shifted number while editing the raw global menu slots', () => {
    const html = renderCard({ editingMenu: true })

    expect(html).toContain('En pedidos se mostrará como Opción 5')
    expect(html).toContain('La Opción 4 está reservada para Hiperproteica')
  })
})
